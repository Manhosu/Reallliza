import type { SupabaseClient } from "@supabase/supabase-js";

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
  available_windows: AvailableWindow[];
}

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function isWeekend(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00`);
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * A partir de startISO, tenta montar bloco de N dias úteis consecutivos
 * pulando sábado, domingo, feriados e dias bloqueados.
 * Retorna array de N ISOs se conseguir; null se estourar horizonte.
 */
function tryBuildWorkdayBlock(
  startISO: string,
  daysNeeded: number,
  holidays: Set<string>,
  blocked: Set<string>,
  horizonISO: string
): AvailableWindow | null {
  const days: string[] = [];
  const cursor = new Date(`${startISO}T00:00:00`);
  const horizonDate = new Date(`${horizonISO}T00:00:00`);
  while (days.length < daysNeeded) {
    if (cursor > horizonDate) return null;
    const iso = fmtISO(cursor);
    const skip = isWeekend(iso) || holidays.has(iso) || blocked.has(iso);
    if (!skip) days.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return { start: days[0], end: days[days.length - 1], workdays: days };
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
  }
): Promise<TeamAvailability[]> {
  const horizon = input.horizon ?? 60;
  const fromDate = new Date(`${input.from}T00:00:00`);
  const horizonDate = new Date(fromDate);
  horizonDate.setDate(horizonDate.getDate() + horizon);
  const horizonISO = fmtISO(horizonDate);

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

    // Constrói primeiras 5 janelas de N dias úteis consecutivos livres
    const windows: AvailableWindow[] = [];
    const cursor = new Date(fromDate);
    while (windows.length < 5 && cursor <= horizonDate) {
      const win = tryBuildWorkdayBlock(
        fmtISO(cursor),
        input.days_needed,
        holidays,
        blocked,
        horizonISO
      );
      if (!win) break;
      windows.push(win);
      // avança 1 dia útil a partir do início do bloco encontrado
      const next = new Date(`${win.start}T00:00:00`);
      next.setDate(next.getDate() + 1);
      cursor.setTime(next.getTime());
    }

    result.push({
      team_id: t.id,
      name: t.name,
      color: t.color,
      member_count: techIds.length,
      blocked_days: Array.from(blocked),
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
