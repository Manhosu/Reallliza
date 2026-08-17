import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/feed/mapa — o mapa do Brasil do painel.
 *
 * Rota separada do painel geral porque o mapa é o cartão mais pesado da tela
 * e o que menos muda: separando, ele carrega depois, e trocar a janela de
 * dias não obriga a recalcular as 27 UFs junto com o resto.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();

    const { searchParams } = new URL(request.url);
    const dias = Math.min(Math.max(Number(searchParams.get("dias") ?? 30), 1), 365);
    const patrocinador = searchParams.get("sponsor_id");

    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const { data, error } = await supabase.rpc("feed_mapa_do_brasil", {
      p_desde: desde.toISOString(),
      p_sponsor_id: patrocinador || null,
    });
    if (error) throw new Error(error.message);

    return jsonResponse({ ufs: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
