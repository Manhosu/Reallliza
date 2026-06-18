import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/service-orders/[id]/steps/report
 * Retorna o relatorio de execucao da OS — uma timeline com todas as
 * etapas, pausas, tempos efetivos e tempo total. Consumido pelo painel
 * admin (web/src/app/(dashboard)/os/[id]) e pelo OsDetailScreen mobile.
 *
 * Permissoes:
 *   - admin/manager: qualquer OS.
 *   - technician: somente OS em que e o technician_id.
 *   - partner: OS em que partner_id casa OU technician_id = user.id
 *     (broadcast aceito por ele).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: order, error: orderErr } = await supabase
      .from("service_orders")
      .select(
        "id, order_number, title, status, technician_id, partner_id, started_at, completed_at"
      )
      .eq("id", id)
      .single();

    if (orderErr || !order) {
      throw new AuthError(404, "OS não encontrada");
    }

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
        throw new AuthError(403, "Sem permissão para ver o relatório desta OS");
      }
    }

    let technicianName: string | null = null;
    if (order.technician_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", order.technician_id)
        .maybeSingle();
      technicianName = (prof?.full_name as string | undefined) ?? null;
    }

    const { data: stepsRaw } = await supabase
      .from("os_step_executions")
      .select("*")
      .eq("service_order_id", id)
      .order("order_index", { ascending: true });

    type StepRow = {
      id: string;
      step_key: string;
      order_index: number;
      status: string;
      started_at: string | null;
      completed_at: string | null;
      paused_at: string | null;
      pause_count: number | null;
      total_pause_seconds: number | null;
      pause_log: Array<{
        paused_at: string;
        resumed_at: string;
        duration_seconds: number;
        reason?: string;
      }> | null;
      unlocked_at: string | null;
      photos_count: number | null;
      notes: string | null;
      metadata: Record<string, unknown> | null;
    };

    const steps = (stepsRaw ?? []) as StepRow[];

    let summaryStart: string | null = null;
    let summaryEnd: string | null = null;
    let summaryTotal = 0;
    let summaryActive = 0;
    let summaryPause = 0;
    let summaryPauses = 0;

    const reportSteps = steps.map((s) => {
      const meta = s.metadata ?? {};
      const name =
        (meta as { name?: string }).name ?? s.step_key ?? "Etapa";
      const waitMin =
        typeof (meta as { wait_time_minutes?: number }).wait_time_minutes ===
        "number"
          ? ((meta as { wait_time_minutes: number }).wait_time_minutes ?? 0)
          : 0;

      let totalDuration: number | null = null;
      let activeDuration: number | null = null;
      if (s.started_at && s.completed_at) {
        totalDuration = Math.max(
          0,
          Math.round(
            (new Date(s.completed_at).getTime() -
              new Date(s.started_at).getTime()) /
              1000
          )
        );
        activeDuration = Math.max(
          0,
          totalDuration - (s.total_pause_seconds ?? 0)
        );
      }

      // Acumula no summary
      if (s.started_at) {
        if (!summaryStart || s.started_at < summaryStart) {
          summaryStart = s.started_at;
        }
      }
      if (s.completed_at) {
        if (!summaryEnd || s.completed_at > summaryEnd) {
          summaryEnd = s.completed_at;
        }
      }
      if (totalDuration !== null) summaryTotal += totalDuration;
      if (activeDuration !== null) summaryActive += activeDuration;
      summaryPause += s.total_pause_seconds ?? 0;
      summaryPauses += s.pause_count ?? 0;

      return {
        id: s.id,
        step_key: s.step_key,
        order_index: s.order_index,
        name,
        status: s.status,
        started_at: s.started_at,
        completed_at: s.completed_at,
        paused_at: s.paused_at,
        total_duration_seconds: totalDuration,
        active_duration_seconds: activeDuration,
        total_pause_seconds: s.total_pause_seconds ?? 0,
        pause_count: s.pause_count ?? 0,
        wait_time_minutes: waitMin,
        unlocked_at: s.unlocked_at,
        pause_log: s.pause_log ?? [],
        photos_count: s.photos_count ?? 0,
        notes: s.notes,
      };
    });

    return jsonResponse({
      os: {
        id: order.id,
        order_number: (order as { order_number: number | null }).order_number,
        title: (order as { title: string }).title,
        status: order.status,
        technician_id: order.technician_id,
        technician_name: technicianName,
        started_at: (order as { started_at: string | null }).started_at,
        completed_at: (order as { completed_at: string | null }).completed_at,
      },
      steps: reportSteps,
      summary: {
        started_at: summaryStart,
        completed_at: summaryEnd,
        total_duration_seconds: summaryTotal,
        total_active_seconds: summaryActive,
        total_pause_seconds: summaryPause,
        total_pauses: summaryPauses,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
