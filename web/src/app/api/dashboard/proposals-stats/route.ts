import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/dashboard/proposals-stats
 * KPIs de propostas pra homologados:
 *   - launched: total de propostas broadcast lancadas
 *   - accepted: aceitas
 *   - rejected: rejeitadas + expired (nao aceita)
 *
 * Admin/manager: KPIs globais (todas as propostas do sistema).
 * Partner (loja): KPIs filtrados pelas propostas das OSs da propria loja
 *   (Jessica 20/07 — "Dashboard da loja tambem deve ter essas informacoes.
 *   Dos homologados que eles contrataram").
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    // Base pra todos os counts: broadcast (partner_id IS NULL)
    // Se o caller e' partner, restringimos aos service_order_id das OSs dele
    let osIdsFilter: string[] | null = null;
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const partnerId = (p as { id?: string } | null)?.id;
      if (!partnerId) throw new AuthError(404, "Parceiro nao encontrado");
      const { data: osRows } = await supabase
        .from("service_orders")
        .select("id")
        .eq("partner_id", partnerId);
      osIdsFilter = ((osRows as { id: string }[]) || []).map((r) => r.id);
      // Sem OSs? Retorna zeros direto
      if (osIdsFilter.length === 0) {
        return jsonResponse({ launched: 0, accepted: 0, rejected: 0 });
      }
    } else if (user.role !== "admin" && user.role !== "manager") {
      throw new AuthError(403, "Sem permissao");
    }

    const applyBase = (q: any) => {
      let query = q.is("partner_id", null);
      if (osIdsFilter) {
        query = query.in("service_order_id", osIdsFilter);
      }
      return query;
    };

    const [launchedRes, acceptedRes, rejectedRes] = await Promise.all([
      applyBase(
        supabase
          .from("service_proposals")
          .select("id", { count: "exact", head: true })
      ),
      applyBase(
        supabase
          .from("service_proposals")
          .select("id", { count: "exact", head: true })
      ).eq("status", "accepted"),
      applyBase(
        supabase
          .from("service_proposals")
          .select("id", { count: "exact", head: true })
      ).in("status", ["rejected", "expired"]),
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
