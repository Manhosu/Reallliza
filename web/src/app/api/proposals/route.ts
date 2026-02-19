import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * GET /api/proposals
 * List proposals.
 * Admin sees all; partners see only their own proposals.
 * Supports ?service_order_id and ?status filters.
 * Includes service_order (id, title, client_name) and partner (id, company_name).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    );
    const serviceOrderId = searchParams.get("service_order_id");
    const status = searchParams.get("status");
    const offset = (page - 1) * limit;

    const supabase = getAdminClient();

    let query = supabase
      .from("service_proposals")
      .select(
        `
        *,
        service_order:service_orders!service_proposals_service_order_id_fkey(id, title, client_name),
        partner:partners!service_proposals_partner_id_fkey(id, company_name)
      `,
        { count: "exact" }
      );

    // Role-based access control
    if (user.role === "partner") {
      // Get the partner record for this user
      const { data: partnerData } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (partnerData) {
        query = query.eq("partner_id", partnerData.id);
      } else {
        return jsonResponse({
          data: [],
          meta: { total: 0, page, limit, total_pages: 0 },
        });
      }
    } else {
      checkRole(user, ["admin", "manager"]);
    }

    // Apply filters
    if (serviceOrderId) {
      query = query.eq("service_order_id", serviceOrderId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    // Pagination and ordering
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch proposals: ${error.message}`);
      throw new Error("Failed to fetch proposals");
    }

    return jsonResponse({
      data: data || [],
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/proposals
 * Create a proposal (send to partner). Admin only.
 * Body: { service_order_id, partner_id, proposed_value?, message?, expires_at? }
 * Creates a notification for the partner's user_id.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const { service_order_id, partner_id, proposed_value, message, expires_at } =
      body;

    if (!service_order_id) {
      throw new AuthError(400, "service_order_id is required");
    }
    if (!partner_id) {
      throw new AuthError(400, "partner_id is required");
    }

    const supabase = getAdminClient();

    // Verify service order exists
    const { data: serviceOrder, error: soError } = await supabase
      .from("service_orders")
      .select("id, title, client_name")
      .eq("id", service_order_id)
      .single();

    if (soError || !serviceOrder) {
      throw new AuthError(
        404,
        `Service order with ID ${service_order_id} not found`
      );
    }

    // Verify partner exists and get user_id for notification
    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select("id, company_name, user_id")
      .eq("id", partner_id)
      .single();

    if (partnerError || !partner) {
      throw new AuthError(404, `Partner with ID ${partner_id} not found`);
    }

    // Build insert data
    const insertData: Record<string, unknown> = {
      service_order_id,
      partner_id,
      status: "pending",
      proposed_by: user.id,
    };

    if (proposed_value !== undefined && proposed_value !== null) {
      insertData.proposed_value = proposed_value;
    }
    if (message) {
      insertData.message = message;
    }
    if (expires_at) {
      insertData.expires_at = expires_at;
    }

    const { data: proposal, error: insertError } = await supabase
      .from("service_proposals")
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error(`Failed to create proposal: ${insertError.message}`);
      throw new Error("Failed to create proposal");
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "proposal.created",
      entityType: "proposal",
      entityId: proposal.id,
      newData: proposal as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    // Notify the partner's user
    if (partner.user_id) {
      try {
        await createNotification(
          partner.user_id,
          "Nova proposta recebida",
          `Voce recebeu uma proposta para a OS "${serviceOrder.title}"`,
          "general",
          {
            proposal_id: proposal.id,
            service_order_id,
          }
        );
      } catch {
        // Notification failure should not break the main operation
      }
    }

    return jsonResponse(proposal, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
