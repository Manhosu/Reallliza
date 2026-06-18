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
      .select("id, technician_id, partner_id, status")
      .eq("id", id)
      .single();

    if (!order) throw new AuthError(404, "OS não encontrada");

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
        throw new AuthError(403, "Sem permissão para esta OS");
      }
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

    // Resume implicito: se a etapa esta pausada quando o tecnico clica
    // concluir, fecha a pausa em aberto antes de marcar completed pra
    // o pause_log nao deixar entrada com resumed_at=null.
    const pausedAt = (step as { paused_at: string | null }).paused_at;
    const totalPause = (step as { total_pause_seconds: number }).total_pause_seconds ?? 0;
    const pauseLog = ((step as { pause_log: unknown[] }).pause_log ?? []) as Array<{
      paused_at: string;
      resumed_at: string;
      duration_seconds: number;
      reason?: string;
    }>;

    const updatePayload: Record<string, unknown> = {
      status: "completed",
      completed_at: completedAt,
      updated_at: completedAt,
      metadata: meta,
    };
    if (notes !== undefined) updatePayload.notes = notes;
    if (photosCount !== undefined) updatePayload.photos_count = photosCount;
    if (!step.started_at) updatePayload.started_at = completedAt;

    if (pausedAt) {
      const pauseDurationSec = Math.max(
        0,
        Math.round((Date.now() - new Date(pausedAt).getTime()) / 1000)
      );
      updatePayload.paused_at = null;
      updatePayload.total_pause_seconds = totalPause + pauseDurationSec;
      updatePayload.pause_log = [
        ...pauseLog,
        {
          paused_at: pausedAt,
          resumed_at: completedAt,
          duration_seconds: pauseDurationSec,
          reason: "Concluído sem retomar manualmente",
        },
      ];
    }

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

    // Destrava a proxima etapa setando unlocked_at = NOW + wait_time_minutes.
    // wait_time_minutes vem do snapshot que esta etapa fez no provisionSteps,
    // entao mesmo se o admin editar o template depois, a regra permanece.
    const waitMin =
      typeof (meta as { wait_time_minutes?: number }).wait_time_minutes === "number"
        ? ((meta as { wait_time_minutes: number }).wait_time_minutes ?? 0)
        : 0;
    const nextUnlockedAt = new Date(
      Date.now() + waitMin * 60 * 1000
    ).toISOString();

    const { data: nextStep } = await supabase
      .from("os_step_executions")
      .select("id, unlocked_at")
      .eq("service_order_id", id)
      .eq("order_index", (step as { order_index: number }).order_index + 1)
      .maybeSingle();

    if (nextStep?.id && !nextStep.unlocked_at) {
      await supabase
        .from("os_step_executions")
        .update({
          unlocked_at: nextUnlockedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", nextStep.id);
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
        next_unlocked_at: nextStep?.id ? nextUnlockedAt : null,
        implicit_resume: !!pausedAt,
      },
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
