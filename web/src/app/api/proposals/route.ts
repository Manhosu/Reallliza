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
    if (user.role === "partner" || user.role === "technician") {
      // Partners/Technicians: veem propostas direcionadas a eles + broadcast
      // que casa com sua região (operating_region contém target_state).
      const { data: profileData } = await supabase
        .from("profiles")
        .select("operating_region")
        .eq("id", user.id)
        .maybeSingle();
      const region = (profileData?.operating_region || "").toUpperCase();

      // Para partner_id direto, o partner_id da proposta = id da tabela partners
      // que liga a um user_id. Para broadcast, partner_id IS NULL.
      // Aceitação direta também passa por user.id em accepted_by.
      let partnerOwnId: string | null = null;
      if (user.role === "partner") {
        const { data: partnerData } = await supabase
          .from("partners")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        partnerOwnId = partnerData?.id ?? null;
      }

      // Build OR filter: (partner_id = my_partner_id) OR (broadcast E região casa)
      const orParts: string[] = [];
      if (partnerOwnId) {
        orParts.push(`partner_id.eq.${partnerOwnId}`);
      }
      // Broadcast geral (target_state IS NULL) — sempre aparece
      // Broadcast com state específico — só se region casa
      if (region) {
        orParts.push(
          `and(partner_id.is.null,or(target_state.is.null,target_state.eq.${region.slice(0, 2)}))`
        );
      } else {
        // sem região cadastrada: vê apenas broadcasts globais
        orParts.push(`and(partner_id.is.null,target_state.is.null)`);
      }

      if (orParts.length === 0) {
        return jsonResponse({
          data: [],
          meta: { total: 0, page, limit, total_pages: 0 },
        });
      }
      query = query.or(orParts.join(","));
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
    const {
      service_order_id,
      partner_id,
      target_state,
      proposed_value,
      message,
      expires_at,
    } = body;

    if (!service_order_id) {
      throw new AuthError(400, "service_order_id is required");
    }
    // Modo direto: partner_id obrigatório.
    // Modo broadcast: partner_id ausente; target_state opcional (UF).
    const isBroadcast = !partner_id;
    if (target_state && (typeof target_state !== "string" || target_state.length !== 2)) {
      throw new AuthError(
        400,
        "target_state deve ser uma UF de 2 letras (ex: SP, PB)"
      );
    }

    const supabase = getAdminClient();

    // Verify service order exists
    const { data: serviceOrder, error: soError } = await supabase
      .from("service_orders")
      .select("id, title, client_name, address_state")
      .eq("id", service_order_id)
      .single();

    if (soError || !serviceOrder) {
      throw new AuthError(
        404,
        `Service order with ID ${service_order_id} not found`
      );
    }

    let partner: { id: string; company_name: string; user_id: string | null } | null = null;
    if (!isBroadcast) {
      const { data, error: partnerError } = await supabase
        .from("partners")
        .select("id, company_name, user_id")
        .eq("id", partner_id)
        .single();

      if (partnerError || !data) {
        throw new AuthError(404, `Partner with ID ${partner_id} not found`);
      }
      partner = data;
    }

    // Build insert data
    const insertData: Record<string, unknown> = {
      service_order_id,
      partner_id: partner?.id ?? null,
      status: "pending",
      proposed_by: user.id,
    };

    if (isBroadcast) {
      insertData.target_state =
        (target_state ? target_state.toUpperCase() : null) ||
        serviceOrder.address_state ||
        null;
    }

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
      action: isBroadcast ? "proposal.broadcast" : "proposal.created",
      entityType: "proposal",
      entityId: proposal.id,
      newData: proposal as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    if (isBroadcast) {
      // Notifica todos os technicians/partners da região alvo (ou todos
      // se target_state é null). Fire-and-forget.
      (async () => {
        try {
          let q = supabase
            .from("profiles")
            .select("id, operating_region")
            .in("role", ["technician", "partner"])
            .eq("status", "active");
          const targetUF = (proposal.target_state as string | null) || "";
          const { data: candidates } = await q;
          const list = (candidates || []).filter((p) => {
            if (!targetUF) return true;
            const region = (p.operating_region || "").toUpperCase();
            return !region || region.includes(targetUF);
          });
          for (const p of list) {
            createNotification(
              p.id,
              "Nova proposta disponível",
              `OS "${serviceOrder.title}" — primeiro a aceitar fica com o serviço.`,
              "general",
              { proposal_id: proposal.id, service_order_id, broadcast: true }
            ).catch(() => {});
          }
        } catch (err) {
          console.error("broadcast notify error:", err);
        }
      })();
    } else if (partner?.user_id) {
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
