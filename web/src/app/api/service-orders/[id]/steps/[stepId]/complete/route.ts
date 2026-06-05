import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/service-orders/[id]/steps/[stepId]/complete
 * Marca uma execução de etapa como `completed`.
 *
 * Body: { notes?, photos_count?, metragem_executada?, intercorrencias? }
 *  - Atualiza notes e photos_count se fornecidos.
 *  - metragem_executada/intercorrencias entram no metadata (passo FINALIZACAO).
 *  - Idempotente: se já está completed, retorna o estado atual.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id, stepId } = await params;

    const body = await request.json().catch(() => ({}));
    const notes = typeof body.notes === "string" ? body.notes : undefined;
    const photosCount =
      typeof body.photos_count === "number" ? body.photos_count : undefined;
    const metragem =
      typeof body.metragem_executada === "number"
        ? body.metragem_executada
        : undefined;
    const intercorrencias =
      typeof body.intercorrencias === "string"
        ? body.intercorrencias
        : undefined;

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

    const { data: step, error: findErr } = await supabase
      .from("os_step_executions")
      .select("*")
      .eq("id", stepId)
      .eq("service_order_id", id)
      .single();

    if (findErr || !step) {
      throw new AuthError(404, "Etapa não encontrada");
    }

    if (step.status === "completed") {
      return jsonResponse(step);
    }

    const completedAt = new Date().toISOString();
    const meta = (step.metadata || {}) as Record<string, unknown>;
    if (metragem !== undefined) meta.metragem_executada = metragem;
    if (intercorrencias !== undefined) meta.intercorrencias = intercorrencias;

    const updatePayload: Record<string, unknown> = {
      status: "completed",
      completed_at: completedAt,
      updated_at: completedAt,
      metadata: meta,
    };
    if (notes !== undefined) updatePayload.notes = notes;
    if (photosCount !== undefined) updatePayload.photos_count = photosCount;
    if (!step.started_at) updatePayload.started_at = completedAt;

    const { data: updated, error: updateErr } = await supabase
      .from("os_step_executions")
      .update(updatePayload)
      .eq("id", stepId)
      .select()
      .single();

    if (updateErr || !updated) {
      console.error("Failed to complete step:", updateErr);
      throw new AuthError(500, "Falha ao concluir etapa");
    }

    logAudit({
      userId: user.id,
      action: "service_order.step_completed",
      entityType: "os_step_execution",
      entityId: stepId,
      newData: {
        completed_at: completedAt,
        notes,
        photos_count: photosCount,
      },
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
