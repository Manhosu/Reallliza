import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createNotification } from "@/lib/api-helpers/notifications";
import { dispatchWebhook } from "@/lib/api-helpers/webhook-dispatcher";
import { provisionSteps } from "../provision-steps/route";
import { recalculateTechnicianScore } from "@/lib/evaluation/recalculate";

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
    // Jessica 10/07: loja e' read-only na OS — nao muda status
    checkRole(user, [
      "admin",
      "manager",
      "gestor",
      "diretor",
      "supervisor",
      "operador",
      "technician",
    ]);
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
      .select("id, status, order_number, title, started_at, technician_id, partner_id, external_callback_url, external_system, external_id, step_template_group_id")
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

    // Permissao de operador (tecnico ou parceiro que aceitou):
    if (user.role === "technician" || user.role === "partner") {
      let partnerOwnId: string | null = null;
      if (user.role === "partner") {
        const { data: pd } = await supabase
          .from("partners")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        partnerOwnId = pd?.id ?? null;
      }
      const okAsTech = order.technician_id === user.id;
      const okAsPartner =
        !!partnerOwnId && order.partner_id === partnerOwnId;
      if (!okAsTech && !okAsPartner) {
        throw new AuthError(403, "You do not have permission to change status of this service order");
      }
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

      // Bloqueia conclusão se houver etapas pendentes (defesa em profundidade).
      const { count: pendingCount } = await supabase
        .from("os_step_executions")
        .select("id", { count: "exact", head: true })
        .eq("service_order_id", id)
        .not("status", "in", "(completed,skipped)");

      if (pendingCount && pendingCount > 0) {
        throw new AuthError(
          400,
          `Existem ${pendingCount} etapa(s) pendente(s). Conclua todas as etapas obrigatórias antes de finalizar a OS.`
        );
      }

      // Bloqueia conclusão sem assinatura — passo obrigatório do gate sequencial
      // (Deslocamento → Cheguei → Etapas → Assinatura → Finalizar).
      const { count: signatureCount } = await supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("service_order_id", id)
        .eq("type", "signature");

      if (!signatureCount || signatureCount < 1) {
        throw new AuthError(
          400,
          "Capture a assinatura do cliente antes de finalizar a OS."
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

    // Auto-provisiona etapas a partir do template quando a OS é designada/iniciada.
    // Não bloqueia a transição se não houver template vinculado ou se já houver execuções.
    if (
      (newStatus === "assigned" || newStatus === "in_progress") &&
      order.step_template_group_id
    ) {
      try {
        await provisionSteps(supabase, id, order.step_template_group_id as string);
      } catch (err) {
        console.warn(
          `Step auto-provisioning skipped for ${id}:`,
          err instanceof Error ? err.message : err
        );
      }
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

    // Recalcula o score/nível do técnico quando a OS conclui ou é
    // cancelada — a fonte SISTEMA depende desses desfechos.
    if (
      (newStatus === "completed" || newStatus === "cancelled") &&
      order.technician_id
    ) {
      try {
        await recalculateTechnicianScore(
          supabase,
          order.technician_id as string
        );
      } catch (e) {
        console.error("recalculateTechnicianScore error:", e);
      }
    }

    const displayNumber = order.order_number || order.title;

    // Mapeia severidade a partir do status alvo — cancelled é urgente
    // (operação parou), completed merece destaque, mudanças intermediárias
    // ficam em normal.
    const statusPriority: "urgent" | "high" | "normal" =
      newStatus === "cancelled"
        ? "urgent"
        : newStatus === "completed"
          ? "high"
          : "normal";

    const statusType =
      newStatus === "completed"
        ? "os_completed"
        : newStatus === "cancelled"
          ? "os_cancelled"
          : "os_status_changed";

    // Notify technician about status change
    if (order.technician_id && order.technician_id !== user.id) {
      try {
        await createNotification(
          order.technician_id,
          `OS #${displayNumber} - Status alterado`,
          `Status alterado de ${currentStatus} para ${newStatus}`,
          statusType,
          {
            service_order_id: id,
            from_status: currentStatus,
            to_status: newStatus,
          },
          { priority: statusPriority }
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
            statusType,
            {
              service_order_id: id,
              from_status: currentStatus,
              to_status: newStatus,
            },
            { priority: statusPriority }
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
