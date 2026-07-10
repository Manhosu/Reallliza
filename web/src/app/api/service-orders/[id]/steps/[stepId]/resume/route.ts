import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/service-orders/[id]/steps/[stepId]/resume
 * Retoma uma execução de etapa pausada.
 *
 *  - Fecha a entrada do pause_log com paused_at, resumed_at, duration_seconds e reason.
 *  - Acumula duration em total_pause_seconds.
 *  - Zera paused_at.
 *  - Idempotente: se nao esta pausada, devolve o estado atual.
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

    const supabase = getAdminClient();

    const { data: order } = await supabase
      .from("service_orders")
      .select("id, technician_id, partner_id")
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
      .select(
        "id, status, paused_at, total_pause_seconds, pause_log, metadata, service_order_id"
      )
      .eq("id", stepId)
      .eq("service_order_id", id)
      .single();

    if (findErr || !step) {
      throw new AuthError(404, "Etapa não encontrada");
    }

    // Idempotência
    if (!step.paused_at) {
      return jsonResponse(step);
    }

    const resumedAt = new Date().toISOString();
    const pausedAt = step.paused_at as string;
    const durationSec = Math.max(
      0,
      Math.round((Date.now() - new Date(pausedAt).getTime()) / 1000)
    );

    const meta = (step.metadata || {}) as Record<string, unknown>;
    const reason =
      typeof meta._current_pause_reason === "string"
        ? (meta._current_pause_reason as string)
        : undefined;
    delete meta._current_pause_reason;

    const log = ((step.pause_log as unknown[]) ?? []) as Array<{
      paused_at: string;
      resumed_at: string;
      duration_seconds: number;
      reason?: string;
    }>;
    log.push({
      paused_at: pausedAt,
      resumed_at: resumedAt,
      duration_seconds: durationSec,
      ...(reason ? { reason } : {}),
    });

    const { data: updated, error: updateErr } = await supabase
      .from("os_step_executions")
      .update({
        paused_at: null,
        total_pause_seconds: (step.total_pause_seconds ?? 0) + durationSec,
        pause_log: log,
        metadata: meta,
        updated_at: resumedAt,
      })
      .eq("id", stepId)
      .select()
      .single();

    if (updateErr || !updated) {
      console.error("Failed to resume step:", updateErr);
      throw new AuthError(500, "Falha ao retomar etapa");
    }

    logAudit({
      userId: user.id,
      action: "service_order.step_resumed",
      entityType: "os_step_execution",
      entityId: stepId,
      newData: {
        resumed_at: resumedAt,
        duration_seconds: durationSec,
        reason: reason ?? null,
      },
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
