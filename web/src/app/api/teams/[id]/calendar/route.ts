import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/teams/[id]/calendar?from=YYYY-MM-DD&days=30
 * Retorna schedules + service_orders da equipe no periodo.
 *
 * Formato:
 * {
 *   team: { id, name, color },
 *   events: [{
 *     id, kind: 'schedule'|'os',
 *     title, date, start_time, end_time,
 *     service_order_id, technician_id, status
 *   }]
 * }
 *
 * A view combina:
 *   - schedules onde schedules.team_id = teamId OU
 *     schedules.technician_id in (team_members)
 *   - service_orders onde os.team_id = teamId (agendamento futuro sem
 *     schedule ainda associado)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id: teamId } = await params;
    const sp = request.nextUrl.searchParams;
    const fromStr = sp.get("from") ?? new Date().toISOString().slice(0, 10);
    const daysParam = Math.min(
      Math.max(parseInt(sp.get("days") ?? "30", 10) || 30, 1),
      90
    );
    const from = new Date(`${fromStr}T00:00:00`);
    const to = new Date(from);
    to.setDate(to.getDate() + daysParam - 1);
    const toStr = to.toISOString().slice(0, 10);

    const supabase = getAdminClient();
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("id, name, color, is_active")
      .eq("id", teamId)
      .single();
    if (teamErr || !team) throw new AuthError(404, "Equipe nao encontrada");

    const { data: members } = await supabase
      .from("team_members")
      .select("technician_id")
      .eq("team_id", teamId);
    const techIds = ((members ?? []) as Array<{ technician_id: string }>).map(
      (m) => m.technician_id
    );

    // Schedules diretamente da equipe OU dos membros
    const scheduleQuery = supabase
      .from("schedules")
      .select(
        `id, service_order_id, technician_id, team_id, date, start_time, end_time, status, notes,
         service_order:service_orders(id, order_number, title, client_name, status, priority)`
      )
      .gte("date", fromStr)
      .lte("date", toStr);

    let query = scheduleQuery;
    if (techIds.length > 0) {
      query = query.or(
        `team_id.eq.${teamId},technician_id.in.(${techIds.join(",")})`
      );
    } else {
      query = query.eq("team_id", teamId);
    }
    const { data: schedules, error: schErr } = await query;
    if (schErr) throw schErr;

    // Service orders da equipe (agendadas mas sem schedule ainda)
    const { data: teamOs } = await supabase
      .from("service_orders")
      .select(
        "id, order_number, title, client_name, status, priority, scheduled_date, scheduled_start_time, scheduled_end_time, technician_id"
      )
      .eq("team_id", teamId)
      .gte("scheduled_date", fromStr)
      .lte("scheduled_date", toStr)
      .not("scheduled_date", "is", null);

    const scheduleOsIds = new Set(
      ((schedules ?? []) as Array<{ service_order_id: string | null }>)
        .map((s) => s.service_order_id)
        .filter(Boolean)
    );

    const events: Array<Record<string, unknown>> = [];

    type OsMini = {
      id: string;
      order_number: string;
      title: string;
      client_name: string;
      status: string;
      priority: string | null;
    };
    for (const s of (schedules ?? []) as unknown as Array<{
      id: string;
      service_order_id: string | null;
      technician_id: string | null;
      team_id: string | null;
      date: string;
      start_time: string | null;
      end_time: string | null;
      status: string;
      notes: string | null;
      service_order: OsMini | OsMini[] | null;
    }>) {
      const os = Array.isArray(s.service_order) ? s.service_order[0] : s.service_order;
      events.push({
        id: s.id,
        kind: "schedule",
        title: os?.title ?? s.notes ?? "Agendamento",
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        status: s.status,
        service_order_id: s.service_order_id,
        service_order: os,
        technician_id: s.technician_id,
      });
    }

    for (const os of (teamOs ?? []) as Array<{
      id: string;
      order_number: string;
      title: string;
      client_name: string;
      status: string;
      priority: string | null;
      scheduled_date: string | null;
      scheduled_start_time: string | null;
      scheduled_end_time: string | null;
      technician_id: string | null;
    }>) {
      if (scheduleOsIds.has(os.id)) continue; // ja veio via schedule
      events.push({
        id: `os_${os.id}`,
        kind: "os",
        title: os.title || `OS #${os.order_number}`,
        date: os.scheduled_date,
        start_time: os.scheduled_start_time,
        end_time: os.scheduled_end_time,
        status: os.status,
        service_order_id: os.id,
        service_order: {
          id: os.id,
          order_number: os.order_number,
          title: os.title,
          client_name: os.client_name,
          status: os.status,
          priority: os.priority,
        },
        technician_id: os.technician_id,
      });
    }

    events.sort((a, b) => {
      const da = String(a.date ?? "");
      const db = String(b.date ?? "");
      if (da !== db) return da.localeCompare(db);
      return String(a.start_time ?? "").localeCompare(String(b.start_time ?? ""));
    });

    return jsonResponse({
      team,
      from: fromStr,
      to: toStr,
      member_count: techIds.length,
      events,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
