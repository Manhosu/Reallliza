import type { SupabaseClient } from "@supabase/supabase-js";
import { toIsoDate, fromIsoDate } from "@/lib/quotes/schedule-window";

/**
 * Disponibilidade de trabalho do homologado (Jéssica, 18/09).
 *
 * Uma agenda vazia não significa disponível — o homologado pode não
 * trabalhar domingo, feriado, à noite ou fora do próprio estado. Essas
 * regras ficam em `technician_availability_settings`, editáveis a
 * qualquer momento pelo próprio homologado (ver /api/profile/availability),
 * e entram como um terceiro filtro na seleção de propostas, ao lado da
 * região (`operating_region`) e da agenda (conflito em `schedules`/
 * `service_orders`) que já existiam.
 *
 * Homologado só é elegível se TODOS os dias exigidos pela OS passarem —
 * um único dia proibido (ex: domingo, com "Trabalho aos domingos"
 * desativado) já exclui o profissional inteiro daquela proposta, mesmo
 * que os outros dias estejam livres (exemplo da Jéssica: OS de sábado e
 * domingo, homologado que não trabalha domingo não entra, ponto).
 */

export interface AvailabilitySettings {
  works_saturday: boolean;
  works_sunday: boolean;
  works_holidays: boolean;
  works_after_hours: boolean;
  works_interstate: boolean;
}

/** Sem linha configurada = tudo disponível, igual ao comportamento de hoje. */
export const DEFAULT_AVAILABILITY: AvailabilitySettings = {
  works_saturday: true,
  works_sunday: true,
  works_holidays: true,
  works_after_hours: true,
  works_interstate: true,
};

export interface RequisitosDaOS {
  /** Data prevista de início (YYYY-MM-DD). Sem isso, não dá pra cruzar — ninguém é excluído. */
  requested_date: string | null;
  /** Horário previsto de início (HH:MM), pra checar noturno/fora do horário comercial. */
  requested_time: string | null;
  /** Duração em dias corridos a partir de requested_date. */
  requested_days: number | null;
  /** UF onde a OS será executada, pra checar o toggle interestadual. */
  target_state: string | null;
}

/** Os dias corridos (YYYY-MM-DD) que a OS ocupa, a partir da data de início. */
export function diasDoIntervalo(startIso: string, dias: number): string[] {
  const total = Math.max(1, dias || 1);
  const cursor = fromIsoDate(startIso);
  const lista: string[] = [];
  for (let i = 0; i < total; i++) {
    lista.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return lista;
}

/** HH:MM -> minutos desde 00:00, pra comparar contra o horário comercial. */
function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** O horário previsto cai fora do horário comercial configurado? */
export function ehForaDoHorarioComercial(
  requestedTime: string | null,
  businessStart: string,
  businessEnd: string
): boolean {
  if (!requestedTime) return false;
  const minutos = paraMinutos(requestedTime);
  return minutos < paraMinutos(businessStart) || minutos >= paraMinutos(businessEnd);
}

/** Um dia específico passa nas regras de sábado/domingo/feriado do homologado? */
export function diaPermitido(
  iso: string,
  settings: AvailabilitySettings,
  feriados: Set<string>
): boolean {
  if (feriados.has(iso) && !settings.works_holidays) return false;
  const dow = fromIsoDate(iso).getDay();
  if (dow === 0 && !settings.works_sunday) return false;
  if (dow === 6 && !settings.works_saturday) return false;
  return true;
}

/** Busca as configurações de vários homologados de uma vez, com o padrão pra quem não tem linha. */
export async function buscarConfiguracoesDisponibilidade(
  supabase: SupabaseClient,
  technicianIds: string[]
): Promise<Map<string, AvailabilitySettings>> {
  const mapa = new Map<string, AvailabilitySettings>();
  if (technicianIds.length === 0) return mapa;
  const { data } = await supabase
    .from("technician_availability_settings")
    .select("technician_id, works_saturday, works_sunday, works_holidays, works_after_hours, works_interstate")
    .in("technician_id", technicianIds);
  for (const row of (data as Array<AvailabilitySettings & { technician_id: string }>) ?? []) {
    mapa.set(row.technician_id, {
      works_saturday: row.works_saturday,
      works_sunday: row.works_sunday,
      works_holidays: row.works_holidays,
      works_after_hours: row.works_after_hours,
      works_interstate: row.works_interstate,
    });
  }
  return mapa;
}

/** Homologados com uma OS/agendamento existente em algum dos dias exigidos — mesmo critério de "ocupado" do mapa/agenda (schedules + service_orders). */
export async function buscarOcupados(
  supabase: SupabaseClient,
  technicianIds: string[],
  dias: string[]
): Promise<Set<string>> {
  const ocupados = new Set<string>();
  if (technicianIds.length === 0 || dias.length === 0) return ocupados;

  const [{ data: agendados }, { data: ordens }] = await Promise.all([
    supabase
      .from("schedules")
      .select("technician_id, date")
      .in("technician_id", technicianIds)
      .in("date", dias)
      .neq("status", "cancelled"),
    supabase
      .from("service_orders")
      .select("technician_id, scheduled_date")
      .in("technician_id", technicianIds)
      .in("scheduled_date", dias)
      .not("status", "in", "(completed,cancelled,invoiced)"),
  ]);
  for (const r of (agendados as Array<{ technician_id: string }>) ?? []) {
    ocupados.add(r.technician_id);
  }
  for (const r of (ordens as Array<{ technician_id: string | null }>) ?? []) {
    if (r.technician_id) ocupados.add(r.technician_id);
  }
  return ocupados;
}

/**
 * Filtra uma lista de candidatos (precisa de `id` e `uf` — o estado do
 * PRÓPRIO homologado, não a região que ele atende) pelos três critérios:
 * disponibilidade configurada, agenda atual, e interestadual. Sem
 * `requested_date`, não dá pra cruzar nada — devolve a lista intacta (é o
 * mesmo comportamento tolerante de hoje, nunca exclui por falta de dado).
 */
export async function filtrarPorDisponibilidade<T extends { id: string; uf?: string | null }>(
  supabase: SupabaseClient,
  candidatos: T[],
  requisitos: RequisitosDaOS
): Promise<T[]> {
  if (candidatos.length === 0 || !requisitos.requested_date) return candidatos;

  const dias = diasDoIntervalo(requisitos.requested_date, requisitos.requested_days ?? 1);
  const ids = candidatos.map((c) => c.id);

  const [{ data: settingsRow }, configuracoes, ocupados, { data: companyRow }] = await Promise.all([
    supabase
      .from("public_holidays")
      .select("date")
      .eq("is_active", true)
      .in("date", dias),
    buscarConfiguracoesDisponibilidade(supabase, ids),
    buscarOcupados(supabase, ids, dias),
    supabase.from("company_settings").select("business_hour_start, business_hour_end").limit(1).maybeSingle(),
  ]);

  const feriados = new Set((settingsRow as Array<{ date: string }> | null)?.map((h) => h.date) ?? []);
  const company = companyRow as { business_hour_start: string; business_hour_end: string } | null;
  const ehNoturno = ehForaDoHorarioComercial(
    requisitos.requested_time,
    company?.business_hour_start ?? "08:00",
    company?.business_hour_end ?? "18:00"
  );
  const uf = (requisitos.target_state || "").toUpperCase().trim();

  return candidatos.filter((c) => {
    if (ocupados.has(c.id)) return false;

    const settings = configuracoes.get(c.id) ?? DEFAULT_AVAILABILITY;
    if (ehNoturno && !settings.works_after_hours) return false;
    for (const iso of dias) {
      if (!diaPermitido(iso, settings, feriados)) return false;
    }

    // Interestadual: só bloqueia quando dá pra saber o estado do próprio
    // homologado E ele diverge da UF da OS — sem `uf` cadastrado, não dá
    // pra afirmar que é fora do estado, então não exclui (mesma tolerância
    // já aplicada ao filtro de região por operating_region vazio).
    const homeUf = (c.uf || "").toUpperCase().trim();
    if (homeUf && uf && homeUf !== uf && !settings.works_interstate) return false;

    return true;
  });
}
