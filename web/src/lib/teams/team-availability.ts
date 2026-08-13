import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildContiguousRun,
  toIsoDate,
  fromIsoDate,
  type WorkdayRules,
} from "@/lib/quotes/schedule-window";

export interface AvailableWindow {
  start: string;
  end: string;
  workdays: string[];
}

export interface TeamAvailability {
  team_id: string;
  name: string;
  color: string;
  member_count: number;
  blocked_days: string[];
  /** Feriados no horizonte — o seletor precisa deles para montar o bloco. */
  holidays: string[];
  available_windows: AvailableWindow[];
}

/**
 * Primeira janela de N dias CONTÍNUOS a partir de startISO.
 *
 * Jessica 12/08: a versão anterior montava "N dias úteis", pulando o que não
 * servia e seguindo em frente — a janela saía com o fim de semana no meio.
 * Agora a sequência tem de ser ininterrupta; se o dia de início não comportar
 * o serviço inteiro, tenta o dia seguinte, até o horizonte.
 */
function tryBuildWorkdayBlock(
  startISO: string,
  daysNeeded: number,
  rules: WorkdayRules,
  horizonISO: string
): AvailableWindow | null {
  const cursor = fromIsoDate(startISO);
  const horizonDate = fromIsoDate(horizonISO);

  while (cursor <= horizonDate) {
    const run = buildContiguousRun(toIsoDate(cursor), daysNeeded, rules);
    if (run) {
      return { start: run[0], end: run[run.length - 1], workdays: run };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

/**
 * Calcula disponibilidade das equipes qualificadas numa especialidade.
 * Retorna primeiras 5 janelas de N dias úteis consecutivos livres por equipe.
 * (Jessica 27/07 D2)
 */
export async function computeTeamAvailability(
  supabase: SupabaseClient,
  input: {
    specialty_id: string | null;
    days_needed: number;
    from: string;
    horizon?: number;
    /**
     * Cliente autorizou execução em fim de semana. Faltava aqui: a janela
     * mostrada na tela sempre pulava sábado e domingo, mesmo em orçamento com
     * allow_weekend, e não batia com o que o backend ia agendar.
     */
    allow_weekend?: boolean;
  }
): Promise<TeamAvailability[]> {
  const horizon = input.horizon ?? 60;
  const fromDate = fromIsoDate(input.from);
  const horizonDate = new Date(fromDate);
  horizonDate.setDate(horizonDate.getDate() + horizon);
  const horizonISO = toIsoDate(horizonDate);

  // Lista equipes ativas
  const { data: teams } = await supabase
    .from("teams")
    .select(
      `id, name, color,
       members:team_members(technician_id)`
    )
    .eq("is_active", true);

  if (!teams || teams.length === 0) return [];

  // Se specialty_id: filtra equipes com pelo menos 1 membro qualificado
  let qualifiedTeamIds: Set<string> | null = null;
  if (input.specialty_id) {
    const allMemberIds = new Set<string>();
    for (const t of teams as Array<{
      members: Array<{ technician_id: string }>;
    }>) {
      for (const m of t.members ?? []) allMemberIds.add(m.technician_id);
    }
    if (allMemberIds.size > 0) {
      const { data: scores } = await supabase
        .from("technician_specialty_scores")
        .select("technician_id")
        .eq("specialty_id", input.specialty_id)
        .in("technician_id", Array.from(allMemberIds));
      const qualifiedTechIds = new Set<string>(
        ((scores ?? []) as Array<{ technician_id: string }>).map(
          (s) => s.technician_id
        )
      );
      qualifiedTeamIds = new Set<string>();
      for (const t of teams as Array<{
        id: string;
        members: Array<{ technician_id: string }>;
      }>) {
        if ((t.members ?? []).some((m) => qualifiedTechIds.has(m.technician_id))) {
          qualifiedTeamIds.add(t.id);
        }
      }
    } else {
      qualifiedTeamIds = new Set<string>();
    }
  }

  // Feriados no horizonte
  const { data: holidayRows } = await supabase
    .from("public_holidays")
    .select("date")
    .gte("date", input.from)
    .lte("date", horizonISO)
    .eq("is_active", true);
  const holidays = new Set<string>(
    ((holidayRows ?? []) as Array<{ date: string }>).map((h) => h.date)
  );

  const result: TeamAvailability[] = [];

  for (const t of teams as Array<{
    id: string;
    name: string;
    color: string;
    members: Array<{ technician_id: string }>;
  }>) {
    if (qualifiedTeamIds && !qualifiedTeamIds.has(t.id)) continue;

    const techIds = (t.members ?? []).map((m) => m.technician_id);

    // Schedules ativos da equipe no range
    let sq = supabase
      .from("schedules")
      .select("date")
      .gte("date", input.from)
      .lte("date", horizonISO)
      .in("status", ["scheduled", "confirmed", "in_progress"]);
    if (techIds.length > 0) {
      sq = sq.or(`team_id.eq.${t.id},technician_id.in.(${techIds.join(",")})`);
    } else {
      sq = sq.eq("team_id", t.id);
    }
    const { data: scheds } = await sq;
    const blocked = new Set<string>(
      ((scheds ?? []) as Array<{ date: string }>).map((s) => s.date)
    );

    // Primeiras 5 janelas de N dias CONTÍNUOS livres
    const rules: WorkdayRules = {
      allowWeekend: !!input.allow_weekend,
      holidays,
      blocked,
    };
    const windows: AvailableWindow[] = [];
    const cursor = new Date(fromDate);
    while (windows.length < 5 && cursor <= horizonDate) {
      const win = tryBuildWorkdayBlock(
        toIsoDate(cursor),
        input.days_needed,
        rules,
        horizonISO
      );
      if (!win) break;
      windows.push(win);
      const next = fromIsoDate(win.start);
      next.setDate(next.getDate() + 1);
      cursor.setTime(next.getTime());
    }

    result.push({
      team_id: t.id,
      name: t.name,
      color: t.color,
      member_count: techIds.length,
      blocked_days: Array.from(blocked),
      // O seletor precisa dos feriados para não oferecer início que não cabe —
      // antes ele montava o bloco com um conjunto de feriados vazio.
      holidays: Array.from(holidays),
      available_windows: windows,
    });
  }

  // Ordena por primeira janela mais próxima
  result.sort((a, b) => {
    const aStart = a.available_windows[0]?.start ?? "9999-12-31";
    const bStart = b.available_windows[0]?.start ?? "9999-12-31";
    return aStart.localeCompare(bStart);
  });

  return result;
}
