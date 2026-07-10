import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/service-orders/[id]/steps/[stepId]/pause
 * Pausa uma execução de etapa em andamento.
 *
 * Body: { reason?: string }
 *  - Valida que a etapa está in_progress e ainda nao pausada.
 *  - Seta paused_at = NOW e incrementa pause_count.
 *  - O fechamento da entrada do pause_log acontece no /resume (ou no
 *    /complete se o tecnico concluir sem retomar manualmente).
 *  - Idempotente: se ja esta pausada, devolve o estado atual.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    // Jessica 10/07: loja e' read-only na OS
    checkRole(user, ["admin", "manager", "gestor", "diretor", "supervisor", "operador", "technician"]);
    const { id, stepId } = await params;

    const body = await request.json().catch(() => ({}));
    const reason =
      typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 500)
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
      .select("id, status, paused_at, pause_count, service_order_id, metadata")
      .eq("id", stepId)
      .eq("service_order_id", id)
      .single();

    if (findErr || !step) {
      throw new AuthError(404, "Etapa não encontrada");
    }

    // Guarda o motivo provisorio no metadata. /resume le e move para
    // o pause_log com a duracao calculada. Evita criar entrada incompleta
    // no log (sem resumed_at) que dificultaria os calculos do relatorio.
    const currentMeta = (step.metadata || {}) as Record<string, unknown>;

    if (step.paused_at) {
      // Idempotente: ja pausada
      return jsonResponse(step);
    }

    if (step.status !== "in_progress") {
      throw new AuthError(
        400,
        `Só é possível pausar etapas em andamento (status atual: ${step.status}).`
      );
    }

    const pausedAt = new Date().toISOString();
    const updateMeta = { ...currentMeta };
    if (reason) updateMeta._current_pause_reason = reason;
    else delete updateMeta._current_pause_reason;

    const { data: updated, error: updateErr } = await supabase
      .from("os_step_executions")
      .update({
        paused_at: pausedAt,
        pause_count: (step.pause_count ?? 0) + 1,
        metadata: updateMeta,
        updated_at: pausedAt,
      })
      .eq("id", stepId)
      .select()
      .single();

    if (updateErr || !updated) {
      console.error("Failed to pause step:", updateErr);
      throw new AuthError(500, "Falha ao pausar etapa");
    }

    logAudit({
      userId: user.id,
      action: "service_order.step_paused",
      entityType: "os_step_execution",
      entityId: stepId,
      newData: { paused_at: pausedAt, reason: reason ?? null },
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
