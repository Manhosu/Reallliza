import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { computeTeamAvailability } from "@/lib/teams/team-availability";

/**
 * GET /api/calendar/team-availability
 * ?specialty_id=uuid&days_needed=int&from=YYYY-MM-DD&horizon=int
 *
 * Retorna equipes qualificadas + janelas de N dias úteis consecutivos livres.
 * Se specialty_id ausente/null → retorna todas as equipes ativas.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const sp = request.nextUrl.searchParams;
    const specialtyId = sp.get("specialty_id");
    const daysNeeded = Math.max(
      1,
      Math.min(30, parseInt(sp.get("days_needed") ?? "1", 10) || 1)
    );
    const from = sp.get("from") ?? new Date().toISOString().slice(0, 10);
    const horizon = Math.max(
      1,
      Math.min(90, parseInt(sp.get("horizon") ?? "60", 10) || 60)
    );

    const supabase = getAdminClient();
    const teams = await computeTeamAvailability(supabase, {
      specialty_id: specialtyId || null,
      days_needed: daysNeeded,
      from,
      horizon,
    });

    return jsonResponse({
      specialty_id: specialtyId || null,
      days_needed: daysNeeded,
      from,
      horizon,
      teams,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
