import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createNotification } from "@/lib/api-helpers/notifications";
import { dispatchWebhook } from "@/lib/api-helpers/webhook-dispatcher";

/**
 * Valid status transitions state machine.
 * Each key is the current status, values are allowed target statuses.
 */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending"],
  pending: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
  completed: ["invoiced", "rejected"],
  invoiced: [],
  cancelled: [],
  rejected: ["pending"],
};

/**
 * PATCH /api/service-orders/[id]/status
 * Update the status of a service order with state machine validation.
 * Creates a status history entry, logs audit, and notifies relevant users.
 *
 * Body: { status: string, notes?: string, version?: number }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const body = await request.json();
    const { status: newStatus, notes, version } = body;

    if (!newStatus) {
      throw new AuthError(400, "Status is required");
    }

    const supabase = getAdminClient();

    // Get current order
    const { data: order, error: findError } = await supabase
      .from("service_orders")
      .select("id, status, order_number, title, started_at, technician_id, partner_id, external_callback_url, external_system, external_id")
      .eq("id", id)
      .single();

    if (findError || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    const currentStatus = order.status as string;

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw new AuthError(
        400,
        `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions?.join(", ") || "none"}`
      );
    }

    // Role-based permission: technicians can only change status of their own orders
    if (user.role === "technician" && order.technician_id !== user.id) {
      throw new AuthError(403, "You do not have permission to change status of this service order");
    }

    // Build the update object
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Set timestamps based on the new status
    if (newStatus === "in_progress" && !order.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    if (newStatus === "completed") {
      updateData.completed_at = new Date().toISOString();

      // Validate minimum photo evidence before completing
      const { count: photoCount } = await supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("service_order_id", id);

      if (!photoCount || photoCount < 1) {
        throw new AuthError(
          400,
          "Nao e possivel finalizar a OS sem evidencias fotograficas. Envie pelo menos 1 foto antes de finalizar."
        );
      }
    }

    // Update the order
    let statusQuery = supabase
      .from("service_orders")
      .update(updateData)
      .eq("id", id);

    // Optimistic locking
    if (version !== undefined) {
      statusQuery = statusQuery.eq("version", version);
    }

    const { data: updatedOrder, error } = await statusQuery.select().single();

    if (error) {
      // PGRST116 = version mismatch (0 rows returned)
      if (version !== undefined && error.code === "PGRST116") {
        throw new AuthError(
          409,
          "Dados desatualizados. Recarregue a pagina e tente novamente."
        );
      }
      console.error(`Failed to change status for order ${id}: ${error.message}`);
      throw new Error("Failed to change service order status");
    }

    // Create status history entry
    const { error: historyError } = await supabase
      .from("os_status_history")
      .insert({
        service_order_id: id,
        from_status: currentStatus,
        to_status: newStatus,
        changed_by: user.id,
        notes: notes || null,
      });

    if (historyError) {
      console.warn(
        `Failed to create status history for order ${id}: ${historyError.message}`
      );
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "service_order.status_changed",
      entityType: "service_order",
      entityId: id,
      oldData: { status: currentStatus },
      newData: { status: newStatus },
    });

    const displayNumber = order.order_number || order.title;

    // Notify technician about status change
    if (order.technician_id && order.technician_id !== user.id) {
      try {
        await createNotification(
          order.technician_id,
          `OS #${displayNumber} - Status alterado`,
          `Status alterado de ${currentStatus} para ${newStatus}`,
          "os_status_changed",
          {
            service_order_id: id,
            from_status: currentStatus,
            to_status: newStatus,
          }
        );
      } catch {
        // Notification failure should not break the main operation
      }
    }

    // Notify partner about status change
    if (order.partner_id) {
      try {
        const { data: partnerData } = await supabase
          .from("partners")
          .select("user_id")
          .eq("id", order.partner_id)
          .single();

        if (partnerData?.user_id && partnerData.user_id !== user.id) {
          await createNotification(
            partnerData.user_id,
            `OS #${displayNumber} - Status alterado`,
            `Status alterado de ${currentStatus} para ${newStatus}`,
            "os_status_changed",
            {
              service_order_id: id,
              from_status: currentStatus,
              to_status: newStatus,
            }
          );
        }
      } catch {
        // Notification failure should not break the main operation
      }
    }

    // Disparar webhook para integrações externas (fire-and-forget)
    if (order.external_callback_url) {
      dispatchWebhook(id, "service_order.status_changed", {
        from_status: currentStatus,
        to_status: newStatus,
        data: {
          technician_id: order.technician_id,
          started_at: order.started_at,
          completed_at: updatedOrder.completed_at || null,
          final_value: updatedOrder.final_value || null,
          tracking_url: `${
            process.env.NEXT_PUBLIC_APP_URL || "https://reallliza-web.vercel.app"
          }/service-orders/${id}`,
        },
      }).catch((err) => console.error("Webhook dispatch failed:", err));
    }

    return jsonResponse(updatedOrder);
  } catch (error) {
    return errorResponse(error);
  }
}
