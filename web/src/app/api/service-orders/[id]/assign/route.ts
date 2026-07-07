import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { provisionSteps } from "../provision-steps/route";

/**
 * POST /api/service-orders/[id]/assign
 *
 * Fecha a designacao de uma OS em `awaiting_assignment` (Jessica 24/06):
 * escolhe tecnico + template de etapas, opcionalmente ajusta agendamento,
 * transiciona status pra 'pending' e provisiona os_step_executions.
 *
 * Body:
 * {
 *   technician_id: string,
 *   step_template_group_id: string,
 *   scheduled_date?: string,   // YYYY-MM-DD — opcional, atualiza schedules
 *   scheduled_start_time?: string,
 *   scheduled_end_time?: string
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id: osId } = await params;
    const body = await request.json();

    if (!body?.technician_id || typeof body.technician_id !== "string") {
      throw new AuthError(400, "technician_id obrigatorio");
    }
    if (
      !body?.step_template_group_id ||
      typeof body.step_template_group_id !== "string"
    ) {
      throw new AuthError(400, "step_template_group_id obrigatorio");
    }

    const supabase = getAdminClient();

    // Carrega OS + valida status
    const { data: os, error: osErr } = await supabase
      .from("service_orders")
      .select("id, status, technician_id, step_template_group_id, address_state")
      .eq("id", osId)
      .maybeSingle();
    if (osErr || !os) throw new AuthError(404, "OS nao encontrada");
    if (os.status !== "awaiting_assignment") {
      throw new AuthError(
        400,
        `OS esta em '${os.status}'; assign so permitido em 'awaiting_assignment'.`
      );
    }

    // Valida tecnico ativo
    const { data: tech } = await supabase
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("id", body.technician_id)
      .maybeSingle();
    if (!tech || !tech.is_active) {
      throw new AuthError(400, "Tecnico invalido ou inativo");
    }

    // Valida template
    const { data: tmpl } = await supabase
      .from("step_template_groups")
      .select("id, name")
      .eq("id", body.step_template_group_id)
      .maybeSingle();
    if (!tmpl) throw new AuthError(400, "Template de etapas invalido");

    // Provisiona etapas (throws em 409 se ja iniciou — nao deveria em
    // awaiting_assignment mas defensivo).
    await provisionSteps(supabase, osId, body.step_template_group_id);

    // Atualiza OS: seta tecnico + template e move pra 'pending'
    const { error: updateErr } = await supabase
      .from("service_orders")
      .update({
        technician_id: body.technician_id,
        step_template_group_id: body.step_template_group_id,
        status: "pending",
      })
      .eq("id", osId);
    if (updateErr) {
      throw new Error(`Falha update service_orders: ${updateErr.message}`);
    }

    // Historico de status
    await supabase.from("os_status_history").insert({
      service_order_id: osId,
      from_status: "awaiting_assignment",
      to_status: "pending",
      changed_by: user.id,
      notes: `Designado: técnico ${tech.full_name}, template "${tmpl.name}"`,
    });

    // Atualiza schedules ja criados (auto-schedule) pra atribuir tecnico
    const scheduleUpdate: Record<string, unknown> = {
      technician_id: body.technician_id,
    };
    if (body.scheduled_date) scheduleUpdate.date = body.scheduled_date;
    if (body.scheduled_start_time)
      scheduleUpdate.start_time = body.scheduled_start_time;
    if (body.scheduled_end_time)
      scheduleUpdate.end_time = body.scheduled_end_time;

    await supabase
      .from("schedules")
      .update(scheduleUpdate)
      .eq("service_order_id", osId)
      .is("technician_id", null);

    logAudit({
      userId: user.id,
      action: "service_order.assigned",
      entityType: "service_order",
      entityId: osId,
      newData: {
        technician_id: body.technician_id,
        step_template_group_id: body.step_template_group_id,
      },
    });

    // Notifica o tecnico designado (fire-and-forget)
    const { createNotification } = await import("@/lib/api-helpers/notifications");
    createNotification(
      body.technician_id,
      "Nova OS designada",
      `Você foi designado(a) para a OS ${osId.slice(0, 8)}.`,
      "os_assigned",
      { service_order_id: osId },
      { priority: "high" }
    ).catch(() => {});

    return jsonResponse({ ok: true, service_order_id: osId });
  } catch (error) {
    return errorResponse(error);
  }
}
