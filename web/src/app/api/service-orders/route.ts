import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * GET /api/service-orders
 * List service orders with pagination and filters.
 * Technicians only see their own orders; partners see their partner's orders;
 * admins/managers see all.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const status = searchParams.get("status");
    const technician_id = searchParams.get("technician_id");
    const partner_id = searchParams.get("partner_id");
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");
    const search = searchParams.get("search");
    const priority = searchParams.get("priority");

    const offset = (page - 1) * limit;

    const supabase = getAdminClient();

    let query = supabase
      .from("service_orders")
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone, avatar_url),
        partner:partners!service_orders_partner_id_fkey(id, company_name, trading_name, contact_name)
      `,
        { count: "exact" }
      );

    // Role-based access control
    if (user.role === "technician") {
      query = query.eq("technician_id", user.id);
    } else if (user.role === "partner") {
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
    }
    // admin / manager can see all

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (partner_id) {
      query = query.eq("partner_id", partner_id);
    }

    if (technician_id) {
      query = query.eq("technician_id", technician_id);
    }

    if (date_from) {
      query = query.gte("created_at", date_from);
    }

    if (date_to) {
      query = query.lte("created_at", `${date_to}T23:59:59.999Z`);
    }

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,client_name.ilike.%${search}%,address_city.ilike.%${search}%`
      );
    }

    // Pagination and ordering
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch service orders: ${error.message}`);
      throw new Error("Failed to fetch service orders");
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
 * POST /api/service-orders
 * Create a new service order.
 * Only admin and manager roles can create.
 * Auto-generates os_number in OS-YYYYMMDD-XXX format.
 * Notifies the assigned technician if one is provided.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const body = await request.json();

    if (!body.title) {
      throw new AuthError(400, "Title is required");
    }
    if (!body.client_name) {
      throw new AuthError(400, "Client name is required");
    }

    const supabase = getAdminClient();

    // Determine initial status
    const initialStatus = body.technician_id ? "assigned" : "pending";

    // Build insert data - order_number is auto-generated (SERIAL)
    const insertData: Record<string, unknown> = {
      title: body.title,
      client_name: body.client_name,
      status: initialStatus,
      created_by: user.id,
    };

    const optionalFields = [
      "description",
      "priority",
      "client_phone",
      "client_email",
      "client_document",
      "address_street",
      "address_number",
      "address_complement",
      "address_neighborhood",
      "address_city",
      "address_state",
      "address_zip",
      "partner_id",
      "technician_id",
      "scheduled_date",
      "scheduled_start_time",
      "scheduled_end_time",
      "notes",
      "metadata",
    ];

    for (const field of optionalFields) {
      if (body[field] !== undefined && body[field] !== null) {
        insertData[field] = body[field];
      }
    }

    if (body.geo_lat !== undefined) insertData.geo_lat = body.geo_lat;
    if (body.geo_lng !== undefined) insertData.geo_lng = body.geo_lng;
    if (body.estimated_value !== undefined) insertData.estimated_value = body.estimated_value;

    const { data: order, error } = await supabase
      .from("service_orders")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`Failed to create service order: ${error.message}`);
      throw new Error("Failed to create service order");
    }

    // Create initial status history entry
    await supabase.from("os_status_history").insert({
      service_order_id: order.id,
      from_status: null,
      to_status: initialStatus,
      changed_by: user.id,
      notes: "Ordem de servico criada",
    });

    // Audit log
    logAudit({
      userId: user.id,
      action: "service_order.created",
      entityType: "service_order",
      entityId: order.id,
      newData: order as Record<string, unknown>,
    });

    // Notify assigned technician
    if (body.technician_id) {
      try {
        await createNotification(
          body.technician_id,
          "Nova OS atribuida",
          `Voce foi atribuido a OS "${body.title}"`,
          "os_assigned",
          { service_order_id: order.id }
        );
      } catch {
        // Notification failure should not break the main operation
      }
    }

    return jsonResponse(order, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
