import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/dashboard/proposals-stats
 * KPIs de propostas pra homologados (Jessica 20/07):
 *   - launched: total de propostas broadcast lancadas
 *   - accepted: aceitas
 *   - rejected: rejeitadas + expired (nao aceita)
 * Admin/manager only.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const supabase = getAdminClient();

    // Todas broadcasts (partner_id IS NULL)
    const [launchedRes, acceptedRes, rejectedRes] = await Promise.all([
      supabase
        .from("service_proposals")
        .select("id", { count: "exact", head: true })
        .is("partner_id", null),
      supabase
        .from("service_proposals")
        .select("id", { count: "exact", head: true })
        .is("partner_id", null)
        .eq("status", "accepted"),
      supabase
        .from("service_proposals")
        .select("id", { count: "exact", head: true })
        .is("partner_id", null)
        .in("status", ["rejected", "expired"]),
    ]);

    if (launchedRes.error || acceptedRes.error || rejectedRes.error) {
      throw new Error(
        launchedRes.error?.message ||
          acceptedRes.error?.message ||
          rejectedRes.error?.message ||
          "Falha ao buscar KPIs"
      );
    }

    return jsonResponse({
      launched: launchedRes.count ?? 0,
      accepted: acceptedRes.count ?? 0,
      rejected: rejectedRes.count ?? 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
