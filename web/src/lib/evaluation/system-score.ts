/**
 * Fonte SISTEMA da avaliação do profissional (Marco 6 / Bloco 3D).
 *
 * Score operacional automático (0-100) derivado dos dados das OS:
 *  - iniciou dentro do prazo agendado
 *  - finalizou dentro do prazo agendado
 *  - abandono operacional (OS iniciada pelo técnico e depois cancelada)
 *
 * Premissa de fuso: scheduled_date/scheduled_*_time são horário de
 * Brasília (UTC-3, sem horário de verão).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const TOLERANCE_MINUTES = 15;
const ABANDON_PENALTY = 10;
const REWORK_PENALTY = 3; // -3 pontos por retrabalho registrado
const REWORK_PENALTY_MAX = 30; // teto: -30 pontos no Score Sistema
const BRAZIL_OFFSET = "-03:00";

export interface SystemScoreResult {
  score: number; // 0-100
  sampleSize: number; // OS concluídas avaliadas
  onTimeStartRate: number; // 0-1
  onTimeFinishRate: number; // 0-1
  abandonedCount: number;
  reworkCount: number;
}

interface OrderRow {
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  started_at: string | null;
  completed_at: string | null;
}

/** Monta o instante-limite a partir de uma data + hora (horário de Brasília). */
function deadline(date: string, time: string): Date {
  return new Date(`${date}T${time}${BRAZIL_OFFSET}`);
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula o score SISTEMA de um técnico.
 * Sem histórico avaliável, retorna score neutro 100 (sem penalidades).
 */
export async function computeSystemScore(
  supabase: SupabaseClient,
  technicianId: string
): Promise<SystemScoreResult> {
  const { data: orders } = await supabase
    .from("service_orders")
    .select(
      "scheduled_date, scheduled_start_time, scheduled_end_time, started_at, completed_at"
    )
    .eq("technician_id", technicianId)
    .in("status", ["completed", "invoiced"]);

  const evaluable = ((orders as OrderRow[] | null) || []).filter(
    (o) => o.scheduled_date && o.started_at && o.completed_at
  );

  let onTimeStart = 0;
  let onTimeFinish = 0;
  for (const o of evaluable) {
    const date = o.scheduled_date as string;

    // Início: só penaliza se houver hora de início agendada.
    if (o.scheduled_start_time) {
      const startLimit = addMinutes(
        deadline(date, o.scheduled_start_time),
        TOLERANCE_MINUTES
      );
      if (new Date(o.started_at as string) <= startLimit) onTimeStart++;
    } else {
      onTimeStart++;
    }

    // Fim: usa a hora de término agendada ou o fim do dia agendado.
    const finishLimit = addMinutes(
      deadline(date, o.scheduled_end_time || "23:59:59"),
      TOLERANCE_MINUTES
    );
    if (new Date(o.completed_at as string) <= finishLimit) onTimeFinish++;
  }

  const sampleSize = evaluable.length;
  const onTimeStartRate = sampleSize ? onTimeStart / sampleSize : 1;
  const onTimeFinishRate = sampleSize ? onTimeFinish / sampleSize : 1;

  // Abandono: OS que o técnico iniciou e terminou cancelada.
  const { count: abandoned } = await supabase
    .from("service_orders")
    .select("id", { count: "exact", head: true })
    .eq("technician_id", technicianId)
    .eq("status", "cancelled")
    .not("started_at", "is", null);

  const abandonedCount = abandoned || 0;

  // Retrabalhos confirmados: cada OS com is_rework=true atribuída a este
  // técnico (parent OS) penaliza o Sistema em REWORK_PENALTY pontos.
  const { count: reworks } = await supabase
    .from("service_orders")
    .select("id", { count: "exact", head: true })
    .eq("technician_id", technicianId)
    .eq("is_rework", true);

  const reworkCount = reworks || 0;
  const reworkPenalty = Math.min(
    reworkCount * REWORK_PENALTY,
    REWORK_PENALTY_MAX
  );

  const base = 100 * (0.5 * onTimeStartRate + 0.5 * onTimeFinishRate);
  const score = Math.max(
    0,
    Math.min(100, base - abandonedCount * ABANDON_PENALTY - reworkPenalty)
  );

  return {
    score: round2(score),
    sampleSize,
    onTimeStartRate: round2(onTimeStartRate),
    onTimeFinishRate: round2(onTimeFinishRate),
    abandonedCount,
    reworkCount,
  };
}
