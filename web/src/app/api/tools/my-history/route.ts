import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/my-history
 * Timeline do TÉCNICO (spec seção 5 do app).
 *
 * "Esta aba representa o HISTÓRICO DO TÉCNICO. Não é o histórico da
 * ferramenta. Ela deverá mostrar todas as ferramentas que esse técnico já
 * utilizou ao longo do tempo."
 *
 * Filtros: ?tool_id= &from= &to=
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const sp = request.nextUrl.searchParams;
    const supabase = getAdminClient();

    let query = supabase
      .from("tool_events")
      .select(
        `id, event_type, description, created_at, condition, notes, photos,
         tool_id, unit_id, custody_id, service_order_id,
         tool:tool_inventory(id, name, photo_url),
         unit:tool_units(id, code, patrimony_code),
         almoxarife:profiles!tool_events_almoxarife_id_fkey(id, full_name),
         service_order:service_orders(id, order_number, title)`
      )
      .eq("technician_id", user.id)
      // Só o que interessa ao técnico: retirada, devolução e ocorrências.
      .in("event_type", [
        "entrega",
        "recebimento",
        "devolucao_solicitada",
        "dano",
        "prorrogacao_aprovada",
        "prorrogacao_recusada",
      ]);

    const toolId = sp.get("tool_id");
    if (toolId) query = query.eq("tool_id", toolId);

    const from = sp.get("from");
    if (from) query = query.gte("created_at", from);

    const to = sp.get("to");
    if (to) query = query.lte("created_at", to);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw new Error(`Failed to fetch technician history: ${error.message}`);

    return jsonResponse(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}
