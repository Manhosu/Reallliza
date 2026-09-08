import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mapa de disponibilidade (Marco 4/5, item 4).
 *
 * Não existe nenhum conceito de capacidade/ocupação no sistema hoje — a
 * única regra parecida era um limiar global fixo (`busy_full = booked_slots
 * >= 3`, usado só pelo seletor de data do orçamento) e um `blocked_days`
 * binário por equipe (usado só pra achar janelas livres pra agendar um
 * serviço novo). Nenhum dos dois serve pra "quem está livre hoje".
 *
 * Definição adotada aqui, por falta de uma capacidade explícita em
 * qualquer lugar do sistema: usa o tamanho real da equipe (contagem de
 * `team_members`) como capacidade.
 *   - Equipe: 0 ocupações = Livre; entre 0 e a capacidade = Parcialmente
 *     ocupado; >= capacidade = Totalmente ocupado.
 *   - Técnico sem equipe: capacidade 1 — só Livre ou Totalmente ocupado,
 *     não existe "parcial" pra uma pessoa só num dia.
 * Isso é uma decisão de design, não um número contratual.
 *
 * A junção schedules + service_orders (uma OS pode estar agendada com
 * `scheduled_date` sem nunca ter ganho uma linha em `schedules` — comum
 * quando ela nasce atribuída direto a uma equipe) é a mesma já usada em
 * GET /api/teams/[id]/calendar, só generalizada pra todas as equipes e
 * técnicos solo de uma vez, em vez de uma consulta por equipe.
 */

export type OccupancyTier = "livre" | "parcial" | "total";

export interface OccupancyDay {
  count: number;
  tier: OccupancyTier;
}

export interface OccupancyResource {
  id: string;
  type: "team" | "technician";
  name: string;
  color: string | null;
  capacity: number;
  days: Record<string, OccupancyDay>;
}

const OS_STATUS_NAO_OCUPA = ["completed", "cancelled", "invoiced"];

export function classificar(count: number, capacity: number): OccupancyTier {
  if (count <= 0) return "livre";
  if (capacity > 0 && count >= capacity) return "total";
  return capacity > 0 ? "parcial" : "total";
}

export async function computeOccupancy(
  supabase: SupabaseClient,
  from: string,
  to: string
): Promise<OccupancyResource[]> {
  const [teamsRes, membersRes, techsRes, schedulesRes, osRes] = await Promise.all([
    supabase.from("teams").select("id, name, color").eq("is_active", true),
    supabase.from("team_members").select("team_id, technician_id"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "technician")
      .eq("status", "active"),
    supabase
      .from("schedules")
      .select("date, technician_id, team_id, service_order_id")
      .gte("date", from)
      .lte("date", to)
      .in("status", ["scheduled", "confirmed", "in_progress"]),
    supabase
      .from("service_orders")
      .select("id, scheduled_date, technician_id, team_id, status")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .not("scheduled_date", "is", null)
      .not("status", "in", `(${OS_STATUS_NAO_OCUPA.join(",")})`),
  ]);

  type Team = { id: string; name: string; color: string | null };
  type Member = { team_id: string; technician_id: string };
  type Tech = { id: string; full_name: string };
  type Schedule = {
    date: string;
    technician_id: string | null;
    team_id: string | null;
    service_order_id: string | null;
  };
  type Os = {
    id: string;
    scheduled_date: string;
    technician_id: string | null;
    team_id: string | null;
    status: string;
  };

  const teams = (teamsRes.data ?? []) as Team[];
  const members = (membersRes.data ?? []) as Member[];
  const techs = (techsRes.data ?? []) as Tech[];
  const schedules = (schedulesRes.data ?? []) as Schedule[];
  const os = (osRes.data ?? []) as Os[];

  const technicianTeams = new Map<string, string[]>();
  const teamMemberCount = new Map<string, number>();
  for (const m of members) {
    teamMemberCount.set(m.team_id, (teamMemberCount.get(m.team_id) ?? 0) + 1);
    const arr = technicianTeams.get(m.technician_id) ?? [];
    arr.push(m.team_id);
    technicianTeams.set(m.technician_id, arr);
  }

  const emAlgumaEquipe = new Set(members.map((m) => m.technician_id));
  const soloTechs = techs.filter((t) => !emAlgumaEquipe.has(t.id));

  const resources = new Map<string, OccupancyResource>();
  for (const t of teams) {
    resources.set(`team:${t.id}`, {
      id: t.id,
      type: "team",
      name: t.name,
      color: t.color,
      capacity: teamMemberCount.get(t.id) ?? 0,
      days: {},
    });
  }
  for (const t of soloTechs) {
    resources.set(`technician:${t.id}`, {
      id: t.id,
      type: "technician",
      name: t.full_name,
      color: null,
      capacity: 1,
      days: {},
    });
  }

  function anota(date: string, teamId: string | null, technicianId: string | null) {
    const alvos = new Set<string>();
    if (teamId && resources.has(`team:${teamId}`)) alvos.add(`team:${teamId}`);
    if (technicianId) {
      const equipes = technicianTeams.get(technicianId);
      if (equipes && equipes.length > 0) {
        for (const eq of equipes) alvos.add(`team:${eq}`);
      } else if (resources.has(`technician:${technicianId}`)) {
        alvos.add(`technician:${technicianId}`);
      }
    }
    for (const key of alvos) {
      const r = resources.get(key);
      if (!r) continue;
      const atual = r.days[date]?.count ?? 0;
      r.days[date] = { count: atual + 1, tier: "livre" };
    }
  }

  const scheduleOsIds = new Set(
    schedules.map((s) => s.service_order_id).filter((v): v is string => !!v)
  );

  for (const s of schedules) {
    anota(s.date, s.team_id, s.technician_id);
  }
  for (const o of os) {
    if (scheduleOsIds.has(o.id)) continue; // ja contado via schedule
    anota(o.scheduled_date, o.team_id, o.technician_id);
  }

  for (const r of resources.values()) {
    for (const date of Object.keys(r.days)) {
      r.days[date].tier = classificar(r.days[date].count, r.capacity);
    }
  }

  return Array.from(resources.values()).sort((a, b) => a.name.localeCompare(b.name));
}
