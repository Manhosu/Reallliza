import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/service-orders/[id]/approve
 * Approve a completed service order. Admin only.
 * Changes status from 'completed' to 'invoiced'.
 * If the order is not in 'completed' status, returns 400.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;

    const supabase = getAdminClient();

    // Get current order
    const { data: order, error: findError } = await supabase
      .from("service_orders")
      .select("id, status, order_number, title")
      .eq("id", id)
      .single();

    if (findError || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    if (order.status !== "completed") {
      throw new AuthError(
        400,
        `Cannot approve a service order with status '${order.status}'. Only orders with status 'completed' can be approved.`
      );
    }

    const now = new Date().toISOString();

    // Update status to 'invoiced'
    const { data: updatedOrder, error: updateError } = await supabase
      .from("service_orders")
      .update({
        status: "invoiced",
        updated_at: now,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error(
        `Failed to approve service order ${id}: ${updateError.message}`
      );
      throw new Error("Failed to approve service order");
    }

    // Create status history entry
    const { error: historyError } = await supabase
      .from("os_status_history")
      .insert({
        service_order_id: id,
        from_status: "completed",
        to_status: "invoiced",
        changed_by: user.id,
        notes: "Ordem de servico aprovada",
      });

    if (historyError) {
      console.warn(
        `Failed to create status history for order ${id}: ${historyError.message}`
      );
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "service_order.approved",
      entityType: "service_order",
      entityId: id,
      oldData: { status: "completed" },
      newData: { status: "invoiced" },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(updatedOrder);
  } catch (error) {
    return errorResponse(error);
  }
}
