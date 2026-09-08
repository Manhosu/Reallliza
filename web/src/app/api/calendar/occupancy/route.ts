import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { computeOccupancy } from "@/lib/teams/occupancy";

/**
 * GET /api/calendar/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Mapa de disponibilidade (Marco 4/5, item 4) — quem (equipe ou técnico
 * solo) está livre, parcialmente ocupado ou totalmente ocupado em cada
 * dia do intervalo. Ferramenta de quem distribui trabalho (admin/gestor
 * decidindo pra quem mandar a próxima OS), não a agenda pessoal do
 * técnico — por isso é admin/manager only.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from") ?? new Date().toISOString().slice(0, 10);
    const daysParam = Math.min(Math.max(parseInt(sp.get("days") ?? "31", 10) || 31, 1), 90);
    const fromDate = new Date(`${from}T00:00:00`);
    if (Number.isNaN(fromDate.getTime())) {
      throw new AuthError(400, "Parâmetro 'from' inválido");
    }
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + daysParam - 1);
    const to = toDate.toISOString().slice(0, 10);

    const supabase = getAdminClient();
    const resources = await computeOccupancy(supabase, from, to);

    return jsonResponse({ from, to, resources });
  } catch (error) {
    return errorResponse(error);
  }
}
