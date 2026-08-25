import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/metrics
 * Indicadores do almoxarifado: contagens por status + alertas (em manutencao
 * ha muito tempo, em custodia atrasada). Apenas admin.
 *
 * Resposta:
 *   {
 *     totals: { available, in_custody, maintenance, retired, all },
 *     custody: { active_count, overdue_count, due_in_7d_count },
 *     requests: { pending_count, approved_count }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "almoxarifado"]);

    const supabase = getAdminClient();

    // Contagens por status
    const { data: statusRows } = await supabase
      .from("tool_inventory")
      .select("status");

    // Jessica 10/08: os quatro status da migration 053 entravam no total mas
    // nao apareciam em bucket nenhum — ferramenta danificada ou extraviada
    // sumia do painel. Agora todo status conhecido tem contador, e o que nao
    // for reconhecido cai em `other` em vez de desaparecer.
    const totals = {
      available: 0,
      in_custody: 0,
      maintenance: 0,
      retired: 0,
      damaged: 0,
      awaiting_evaluation: 0,
      missing: 0,
      reserved: 0,
      other: 0,
      all: 0,
    };
    const COUNTED = new Set([
      "available",
      "in_custody",
      "maintenance",
      "retired",
      "damaged",
      "awaiting_evaluation",
      "missing",
      "reserved",
    ]);
    for (const row of (statusRows ?? []) as Array<{ status: string }>) {
      totals.all++;
      if (COUNTED.has(row.status)) {
        totals[row.status as keyof typeof totals]++;
      } else {
        totals.other++;
      }
    }

    // Custodia ativa + atrasadas
    const nowIso = new Date().toISOString();
    const in7dIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count: activeCustodyCount } = await supabase
      .from("tool_custody")
      .select("*", { count: "exact", head: true })
      .is("checked_in_at", null);

    const { count: overdueCount } = await supabase
      .from("tool_custody")
      .select("*", { count: "exact", head: true })
      .is("checked_in_at", null)
      .lt("expected_return_at", nowIso);

    const { count: dueIn7dCount } = await supabase
      .from("tool_custody")
      .select("*", { count: "exact", head: true })
      .is("checked_in_at", null)
      .gte("expected_return_at", nowIso)
      .lte("expected_return_at", in7dIso);

    // Requisicoes. Os estados intermediarios da 053 (separating,
    // awaiting_pickup, delivered) tambem contam — sem eles o painel dizia
    // "0 pedidos" com a fila cheia de pedidos em separacao.
    const { count: pendingReq } = await supabase
      .from("tool_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: approvedReq } = await supabase
      .from("tool_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");

    const { count: separatingReq } = await supabase
      .from("tool_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "separating");

    const { count: awaitingPickupReq } = await supabase
      .from("tool_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "awaiting_pickup");

    const { count: deliveredReq } = await supabase
      .from("tool_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "delivered");

    return jsonResponse({
      totals,
      custody: {
        active_count: activeCustodyCount ?? 0,
        overdue_count: overdueCount ?? 0,
        due_in_7d_count: dueIn7dCount ?? 0,
      },
      requests: {
        pending_count: pendingReq ?? 0,
        approved_count: approvedReq ?? 0,
        separating_count: separatingReq ?? 0,
        awaiting_pickup_count: awaitingPickupReq ?? 0,
        delivered_count: deliveredReq ?? 0,
        /** Tudo que ainda exige acao do operador do almoxarifado. */
        open_count:
          (pendingReq ?? 0) +
          (approvedReq ?? 0) +
          (separatingReq ?? 0) +
          (awaitingPickupReq ?? 0),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
