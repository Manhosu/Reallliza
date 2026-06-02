import type { SupabaseClient } from "@supabase/supabase-js";

export type ScheduleSource = "manual" | "os" | "os_assignment" | "proposal_accepted";

export interface CreateScheduleFromOsResult {
  /** "created" | "skipped_no_date" | "conflict" | "exists" */
  outcome: "created" | "skipped_no_date" | "conflict" | "exists";
  schedule_id?: string;
  conflict_message?: string;
}

/**
 * Cria automaticamente um registro em `schedules` a partir de uma OS
 * (quando o admin atribui um técnico OU quando uma proposta é aceita).
 *
 * Política:
 * - Se a OS não tem `scheduled_date`, retorna { outcome: "skipped_no_date" }
 *   (admin precisa preencher data depois).
 * - Se já existe schedule pra (service_order_id, technician_id), não duplica.
 * - Se há conflito de horário com outro schedule do mesmo técnico no mesmo
 *   dia, retorna { outcome: "conflict", conflict_message } — caller decide
 *   se aborta a atribuição ou só notifica.
 *
 * Não dispara exceções: o caller (rota da OS) trata o resultado.
 */
export async function createScheduleFromOs(
  supabase: SupabaseClient,
  serviceOrderId: string,
  technicianId: string,
  source: ScheduleSource = "os_assignment"
): Promise<CreateScheduleFromOsResult> {
  // 1. Lê data/horário da OS
  const { data: so, error: soErr } = await supabase
    .from("service_orders")
    .select("id, scheduled_date, scheduled_start_time, scheduled_end_time")
    .eq("id", serviceOrderId)
    .single();

  if (soErr || !so) {
    return {
      outcome: "skipped_no_date",
      conflict_message: "OS não encontrada",
    };
  }

  const date = (so as { scheduled_date?: string | null }).scheduled_date;
  if (!date) {
    return { outcome: "skipped_no_date" };
  }

  const startTime =
    (so as { scheduled_start_time?: string | null }).scheduled_start_time ??
    null;
  const endTime =
    (so as { scheduled_end_time?: string | null }).scheduled_end_time ?? null;

  // 2. Já existe schedule pra essa (OS, técnico)?
  const { data: existing } = await supabase
    .from("schedules")
    .select("id")
    .eq("service_order_id", serviceOrderId)
    .eq("technician_id", technicianId)
    .maybeSingle();

  if (existing?.id) {
    return { outcome: "exists", schedule_id: existing.id as string };
  }

  // 3. Conflito de horário (só faz checagem se temos start/end)
  if (startTime && endTime) {
    const { data: conflicts } = await supabase
      .from("schedules")
      .select("id, start_time, end_time")
      .eq("technician_id", technicianId)
      .eq("date", date)
      .not("status", "eq", "cancelled")
      .not("start_time", "is", null)
      .not("end_time", "is", null);

    for (const c of conflicts ?? []) {
      const existStart = (c as { start_time: string }).start_time;
      const existEnd = (c as { end_time: string }).end_time;
      // Overlap clássico
      if (startTime < existEnd && endTime > existStart) {
        return {
          outcome: "conflict",
          conflict_message: `Técnico já tem agendamento das ${existStart.slice(0, 5)} às ${existEnd.slice(0, 5)} em ${date}.`,
        };
      }
    }
  }

  // 4. Cria
  const { data: created, error: insErr } = await supabase
    .from("schedules")
    .insert({
      service_order_id: serviceOrderId,
      technician_id: technicianId,
      date,
      start_time: startTime,
      end_time: endTime,
      status: "scheduled",
      source,
    })
    .select("id")
    .single();

  if (insErr) {
    console.error(`createScheduleFromOs insert error: ${insErr.message}`);
    return {
      outcome: "skipped_no_date",
      conflict_message: insErr.message,
    };
  }

  return {
    outcome: "created",
    schedule_id: (created as { id: string }).id,
  };
}
