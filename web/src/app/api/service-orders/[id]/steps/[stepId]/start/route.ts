import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/service-orders/[id]/steps/[stepId]/start
 * Marca uma execução de etapa como `in_progress`.
 * Idempotente: se já está in_progress/completed, retorna o estado atual.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id, stepId } = await params;

    const supabase = getAdminClient();

    const { data: order } = await supabase
      .from("service_orders")
      .select("id, technician_id, status")
      .eq("id", id)
      .single();

    if (!order) throw new AuthError(404, "OS não encontrada");

    if (user.role === "technician" && order.technician_id !== user.id) {
      throw new AuthError(403, "Sem permissão para esta OS");
    }

    if (order.status !== "in_progress") {
      throw new AuthError(
        400,
        `Só é possível iniciar etapas com a OS em execução (status atual: ${order.status}).`
      );
    }

    const { data: step, error: findErr } = await supabase
      .from("os_step_executions")
      .select("id, status, service_order_id")
      .eq("id", stepId)
      .eq("service_order_id", id)
      .single();

    if (findErr || !step) {
      throw new AuthError(404, "Etapa não encontrada");
    }

    // Idempotência
    if (step.status === "in_progress" || step.status === "completed") {
      return jsonResponse(step);
    }

    const startedAt = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from("os_step_executions")
      .update({
        status: "in_progress",
        started_at: startedAt,
        updated_at: startedAt,
      })
      .eq("id", stepId)
      .select()
      .single();

    if (updateErr || !updated) {
      console.error("Failed to start step:", updateErr);
      throw new AuthError(500, "Falha ao iniciar etapa");
    }

    logAudit({
      userId: user.id,
      action: "service_order.step_started",
      entityType: "os_step_execution",
      entityId: stepId,
      newData: { started_at: startedAt },
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
