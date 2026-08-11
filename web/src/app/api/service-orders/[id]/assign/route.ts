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
      .select(
        "id, status, technician_id, team_id, step_template_group_id, address_state"
      )
      .eq("id", osId)
      .maybeSingle();
    if (osErr || !os) throw new AuthError(404, "OS nao encontrada");
    // Jessica 10/08: 'assigned' tambem entra aqui. O auto-assign da conversao
    // de orcamento deixa a OS em 'assigned' com technician_id NULL (so' a
    // equipe definida) — antes disso o admin nao conseguia nomear o
    // responsavel pela tela de designacao, tomava 400.
    const ASSIGNABLE = ["awaiting_assignment", "assigned"];
    if (!ASSIGNABLE.includes(os.status)) {
      throw new AuthError(
        400,
        `OS esta em '${os.status}'; assign so permitido em ${ASSIGNABLE.join(" ou ")}.`
      );
    }

    // Valida tecnico ativo (profiles usa enum status, nao is_active)
    const { data: tech } = await supabase
      .from("profiles")
      .select("id, full_name, status, role")
      .eq("id", body.technician_id)
      .maybeSingle();
    if (!tech) {
      throw new AuthError(400, "Tecnico nao encontrado");
    }
    if (tech.status !== "active") {
      throw new AuthError(400, `Tecnico esta com status '${tech.status}' — nao pode ser designado`);
    }
    if (tech.role !== "technician") {
      throw new AuthError(400, `Usuario nao e' tecnico (role='${tech.role}')`);
    }

    // Valida template
    const { data: tmpl } = await supabase
      .from("step_template_groups")
      .select("id, name")
      .eq("id", body.step_template_group_id)
      .maybeSingle();
    if (!tmpl) throw new AuthError(400, "Template de etapas invalido");

    // Aditivo Marco 4: valida cursos obrigatorios das categorias da OS.
    // Bloqueia se tecnico nao completou algum curso pre-requisito.
    const { validateCoursePrerequisites } = await import(
      "@/lib/service-orders/course-prerequisites"
    );
    const prereq = await validateCoursePrerequisites(
      supabase,
      osId,
      body.technician_id
    );
    if (!prereq.ok) {
      const list = prereq.missing.map((c) => c.title).join(", ");
      throw new AuthError(
        400,
        `Tecnico nao completou cursos obrigatorios: ${list}`
      );
    }

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

    // Aditivo Marco 4: dispara category automation apos assign manual
    // (o hook em /status route so' dispara em 'assigned'|'in_progress',
    // mas o /assign passa direto pra 'pending' via state machine).
    try {
      const { applyCategoryAutomation } = await import(
        "@/lib/service-orders/category-automation"
      );
      await applyCategoryAutomation(supabase, osId);
    } catch (err) {
      console.warn(
        `assign: category automation failed: ${err instanceof Error ? err.message : err}`
      );
    }

    // Historico de status
    await supabase.from("os_status_history").insert({
      service_order_id: osId,
      from_status: os.status,
      to_status: "pending",
      changed_by: user.id,
      notes: `Designado: técnico ${tech.full_name}, template "${tmpl.name}"`,
    });

    // Atualiza schedules ja criados (auto-schedule) pra atribuir tecnico.
    // Jessica 10/08: propaga tambem o team_id da OS — sem ele o schedule
    // sumia do calendario da equipe, que filtra por team_id OU membro.
    const scheduleUpdate: Record<string, unknown> = {
      technician_id: body.technician_id,
    };
    if (os.team_id) scheduleUpdate.team_id = os.team_id;
    if (body.scheduled_date) scheduleUpdate.date = body.scheduled_date;
    if (body.scheduled_start_time)
      scheduleUpdate.start_time = body.scheduled_start_time;
    if (body.scheduled_end_time)
      scheduleUpdate.end_time = body.scheduled_end_time;

    const { data: updatedSchedules } = await supabase
      .from("schedules")
      .update(scheduleUpdate)
      .eq("service_order_id", osId)
      .is("technician_id", null)
      .select("id");

    // Nenhum schedule pre-existente (OS criada sem auto-agendamento): cria um
    // a partir da data da propria OS, se ela tiver.
    if (!updatedSchedules || updatedSchedules.length === 0) {
      const { createScheduleFromOs } = await import(
        "@/lib/api-helpers/schedules"
      );
      const result = await createScheduleFromOs(
        supabase,
        osId,
        body.technician_id,
        "os_assignment",
        os.team_id ?? null
      );
      if (result.outcome === "conflict") {
        console.warn(
          `assign: schedule nao criado por conflito — ${result.conflict_message}`
        );
      }
    }

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
