import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/service-orders/[id]
 * Get a single service order by ID with related data:
 * partner name, technician name, creator info, photos count.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: order, error } = await supabase
      .from("service_orders")
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone, avatar_url, specialties),
        partner:partners!service_orders_partner_id_fkey(id, company_name, trading_name, contact_name, contact_phone, contact_email),
        creator:profiles!service_orders_created_by_fkey(id, full_name, email)
      `
      )
      .eq("id", id)
      .single();

    if (error || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    // Role-based access: technicians can only see their own orders
    if (user.role === "technician" && order.technician_id !== user.id) {
      throw new AuthError(403, "You do not have permission to view this service order");
    }

    // Partners can only see their own partner's orders
    if (user.role === "partner") {
      const { data: partnerData } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!partnerData || order.partner_id !== partnerData.id) {
        throw new AuthError(403, "You do not have permission to view this service order");
      }
    }

    // Get photos count
    const { count: photosCount } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("service_order_id", id);

    // Get latest status history entries
    const { data: statusHistory } = await supabase
      .from("os_status_history")
      .select(
        `
        *,
        changed_by_user:profiles!os_status_history_changed_by_fkey(id, full_name)
      `
      )
      .eq("service_order_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    return jsonResponse({
      ...order,
      photos_count: photosCount || 0,
      status_history: statusHistory || [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/service-orders/[id]
 * Update an existing service order.
 * Admin/manager can update all fields. Technicians can update limited fields
 * (notes, metadata). Does not allow status changes (use PATCH /status).
 * Does not allow updating completed or cancelled orders.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const body = await request.json();

    const supabase = getAdminClient();

    // Verify the order exists and get current data for audit
    const { data: existing, error: findError } = await supabase
      .from("service_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    // Don't allow updates to completed or cancelled orders
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new AuthError(
        400,
        `Cannot update a service order with status: ${existing.status}`
      );
    }

    // Determine allowed fields based on role
    let updatePayload: Record<string, unknown> = {};

    if (user.role === "admin" || user.role === "manager") {
      // Admin/manager can update most fields
      const allowedFields = [
        "title",
        "description",
        "priority",
        "client_name",
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
        "geo_lat",
        "geo_lng",
        "partner_id",
        "technician_id",
        "scheduled_date",
        "estimated_value",
        "notes",
        "metadata",
      ];

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updatePayload[field] = body[field];
        }
      }
    } else if (user.role === "technician") {
      // Technician can only update limited fields
      if (existing.technician_id !== user.id) {
        throw new AuthError(403, "You do not have permission to update this service order");
      }

      const techAllowedFields = ["notes", "metadata"];
      for (const field of techAllowedFields) {
        if (body[field] !== undefined) {
          updatePayload[field] = body[field];
        }
      }
    } else {
      checkRole(user, ["admin", "manager", "technician"]);
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new AuthError(400, "No valid fields to update");
    }

    updatePayload.updated_at = new Date().toISOString();

    // Build update query
    let query = supabase
      .from("service_orders")
      .update(updatePayload)
      .eq("id", id);

    // Optimistic locking: only update if version matches
    if (body.version !== undefined) {
      query = query.eq("version", body.version);
    }

    const { data: order, error } = await query.select().single();

    if (error) {
      // PGRST116 = version mismatch (0 rows returned)
      if (body.version !== undefined && error.code === "PGRST116") {
        throw new AuthError(
          409,
          "Dados desatualizados. Recarregue a pagina e tente novamente."
        );
      }
      console.error(`Failed to update service order ${id}: ${error.message}`);
      throw new Error("Failed to update service order");
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "service_order.updated",
      entityType: "service_order",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      newData: order as Record<string, unknown>,
    });

    return jsonResponse(order);
  } catch (error) {
    return errorResponse(error);
  }
}
