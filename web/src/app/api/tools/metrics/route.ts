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
    checkRole(user, ["admin"]);

    const supabase = getAdminClient();

    // Contagens por status
    const { data: statusRows } = await supabase
      .from("tool_inventory")
      .select("status");

    const totals = { available: 0, in_custody: 0, maintenance: 0, retired: 0, all: 0 };
    for (const row of (statusRows ?? []) as Array<{ status: string }>) {
      totals.all++;
      if (row.status === "available") totals.available++;
      else if (row.status === "in_custody") totals.in_custody++;
      else if (row.status === "maintenance") totals.maintenance++;
      else if (row.status === "retired") totals.retired++;
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

    // Requisicoes
    const { count: pendingReq } = await supabase
      .from("tool_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: approvedReq } = await supabase
      .from("tool_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");

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
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
