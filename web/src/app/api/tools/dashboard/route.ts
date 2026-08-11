import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/dashboard
 * Alimenta o Dashboard do almoxarifado (spec seção 4): 12 indicadores
 * clicáveis e 8 blocos operacionais.
 *
 * Os indicadores contam UNIDADES quando o tipo é controlado e TIPOS quando é
 * por quantidade, porque é isso que o operador vê na prateleira.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const supabase = getAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59
    ).toISOString();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString();

    const countUnits = (status: string) =>
      supabase
        .from("tool_units")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

    const countRequests = (status: string) =>
      supabase
        .from("tool_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

    const [
      disponiveis,
      reservadas,
      emCustodiaUnid,
      emManutencaoUnid,
      danificadas,
      extraviadas,
      baixadas,
      totalUnidades,
      pedidosAnalise,
      pedidosSeparando,
      pedidosProntos,
      custodiaAtiva,
      custodiaAtrasada,
      custodiaVenceHoje,
      devolucaoSolicitada,
      danosComunicados,
      prorrogacoesPendentes,
    ] = await Promise.all([
      countUnits("available"),
      countUnits("reserved"),
      countUnits("in_custody"),
      countUnits("maintenance"),
      countUnits("damaged"),
      countUnits("missing"),
      countUnits("retired"),
      supabase.from("tool_units").select("*", { count: "exact", head: true }),
      countRequests("pending"),
      countRequests("separating"),
      countRequests("awaiting_pickup"),
      supabase
        .from("tool_custody")
        .select("*", { count: "exact", head: true })
        .is("checked_in_at", null),
      supabase
        .from("tool_custody")
        .select("*", { count: "exact", head: true })
        .is("checked_in_at", null)
        .not("expected_return_at", "is", null)
        .lt("expected_return_at", startOfToday),
      supabase
        .from("tool_custody")
        .select("*", { count: "exact", head: true })
        .is("checked_in_at", null)
        .gte("expected_return_at", startOfToday)
        .lte("expected_return_at", endOfToday),
      supabase
        .from("tool_custody")
        .select("*", { count: "exact", head: true })
        .is("checked_in_at", null)
        .not("return_requested_at", "is", null),
      supabase
        .from("tool_custody")
        .select("*", { count: "exact", head: true })
        .is("checked_in_at", null)
        .not("damage_reported_at", "is", null),
      supabase
        .from("tool_extension_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    // Blocos operacionais
    const custodySelect = `id, checked_out_at, expected_return_at, return_requested_at,
       damage_reported_at, tool_id, unit_id, service_order_id,
       tool:tool_inventory(id, name, photo_url),
       unit:tool_units(id, code, patrimony_code),
       user:profiles!tool_custody_user_id_fkey(id, full_name),
       service_order:service_orders(id, order_number)`;

    const [
      pedidosRecentes,
      aguardandoSeparacao,
      prontasRetirada,
      proximasDevolucoes,
      custodiasAtrasadas,
      devolucoesPendentes,
      danos,
      ultimasMovimentacoes,
    ] = await Promise.all([
      supabase
        .from("tool_requests")
        .select(
          `id, tool_name, quantity, status, priority, created_at, service_order_id,
           requester:profiles!tool_requests_requester_id_fkey(id, full_name)`
        )
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("tool_requests")
        .select(
          `id, tool_name, quantity, status, priority, created_at,
           requester:profiles!tool_requests_requester_id_fkey(id, full_name)`
        )
        .in("status", ["approved", "separating"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(6),
      supabase
        .from("tool_requests")
        .select(
          `id, tool_name, quantity, status, created_at,
           requester:profiles!tool_requests_requester_id_fkey(id, full_name)`
        )
        .eq("status", "awaiting_pickup")
        .order("created_at", { ascending: true })
        .limit(6),
      supabase
        .from("tool_custody")
        .select(custodySelect)
        .is("checked_in_at", null)
        .not("expected_return_at", "is", null)
        .gte("expected_return_at", nowIso)
        .order("expected_return_at", { ascending: true })
        .limit(6),
      supabase
        .from("tool_custody")
        .select(custodySelect)
        .is("checked_in_at", null)
        .not("expected_return_at", "is", null)
        .lt("expected_return_at", startOfToday)
        .order("expected_return_at", { ascending: true })
        .limit(6),
      supabase
        .from("tool_custody")
        .select(custodySelect)
        .is("checked_in_at", null)
        .not("return_requested_at", "is", null)
        .order("return_requested_at", { ascending: true })
        .limit(6),
      supabase
        .from("tool_custody")
        .select(custodySelect)
        .is("checked_in_at", null)
        .not("damage_reported_at", "is", null)
        .order("damage_reported_at", { ascending: false })
        .limit(6),
      supabase
        .from("tool_events")
        .select(
          `id, event_type, description, created_at, tool_id, unit_id,
           tool:tool_inventory(id, name),
           unit:tool_units(id, code)`
        )
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    return jsonResponse({
      indicators: {
        available: disponiveis.count ?? 0,
        reserved: reservadas.count ?? 0,
        separating: pedidosSeparando.count ?? 0,
        awaiting_pickup: pedidosProntos.count ?? 0,
        // Conta CUSTÓDIAS ativas, não unidades com status in_custody: itens
        // controlados por quantidade não têm unidade, e o indicador mostrava
        // zero mesmo com ferramentas na mão dos técnicos.
        in_custody: custodiaAtiva.count ?? 0,
        in_custody_units: emCustodiaUnid.count ?? 0,
        return_requested: devolucaoSolicitada.count ?? 0,
        due_today: custodiaVenceHoje.count ?? 0,
        overdue: custodiaAtrasada.count ?? 0,
        maintenance: emManutencaoUnid.count ?? 0,
        damage_reported: danosComunicados.count ?? 0,
        extension_pending: prorrogacoesPendentes.count ?? 0,
        pending_requests: pedidosAnalise.count ?? 0,
      },
      totals: {
        units: totalUnidades.count ?? 0,
        damaged: danificadas.count ?? 0,
        missing: extraviadas.count ?? 0,
        retired: baixadas.count ?? 0,
        active_custody: custodiaAtiva.count ?? 0,
      },
      blocks: {
        recent_requests: pedidosRecentes.data ?? [],
        awaiting_separation: aguardandoSeparacao.data ?? [],
        ready_for_pickup: prontasRetirada.data ?? [],
        upcoming_returns: proximasDevolucoes.data ?? [],
        overdue_custody: custodiasAtrasadas.data ?? [],
        pending_returns: devolucoesPendentes.data ?? [],
        reported_damages: danos.data ?? [],
        latest_events: ultimasMovimentacoes.data ?? [],
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
