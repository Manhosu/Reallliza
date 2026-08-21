import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { resolverSponsorOpcional } from "@/lib/feed/sponsor-auth";

/**
 * GET /api/feed/meta
 *
 * Tudo que o editor precisa para montar os seletores, numa chamada só:
 * categorias, audiências, patrocinadores e campanhas.
 *
 * Quatro chamadas separadas ao abrir o editor seriam quatro autenticações
 * para dados que praticamente não mudam.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    // Só admin vê tudo sem filtro. Qualquer outro papel (sponsor, parceiro
    // vinculado, ou até quem não tem nada a ver com o Feed — este endpoint
    // não tem checkRole) só pode ver a própria linha, nunca a lista inteira
    // de patrocinadores/campanhas de todo mundo.
    const ehAdmin = user.role === "admin";
    const poderEstarVinculado = user.role === "sponsor" || user.role === "partner";
    const meuSponsorId = poderEstarVinculado ? await resolverSponsorOpcional(supabase, user.id) : null;

    // Papel vinculável mas sem vínculo de verdade: não é admin, então não
    // vê nada — nem consulta o banco à toa.
    const semAcessoAPatrocinador = !ehAdmin && poderEstarVinculado && !meuSponsorId;
    const semAcessoNenhum = !ehAdmin && !poderEstarVinculado;

    let consultaPatrocinadores = supabase
      .from("feed_sponsors")
      .select("id, name, logo_url, primary_color")
      .eq("is_active", true)
      .order("name");
    if (meuSponsorId) consultaPatrocinadores = consultaPatrocinadores.eq("id", meuSponsorId);

    let consultaCampanhas = supabase
      .from("feed_campaigns")
      .select("id, name, status, sponsor_id, starts_at, ends_at")
      .in("status", ["draft", "scheduled", "active"])
      .order("name");
    if (meuSponsorId) consultaCampanhas = consultaCampanhas.eq("sponsor_id", meuSponsorId);

    const [categorias, audiencias, patrocinadores, campanhas] = await Promise.all([
      supabase
        .from("feed_categories")
        .select("id, slug, name, icon, color, requires_sponsor, default_notify")
        .eq("is_active", true)
        .order("order_index"),
      supabase
        .from("feed_audience_rules")
        .select("id, name, description, estimated_size, computed_at")
        .order("name"),
      semAcessoAPatrocinador || semAcessoNenhum ? Promise.resolve({ data: [] }) : consultaPatrocinadores,
      semAcessoAPatrocinador || semAcessoNenhum ? Promise.resolve({ data: [] }) : consultaCampanhas,
    ]);

    return jsonResponse({
      categorias: categorias.data ?? [],
      audiencias: audiencias.data ?? [],
      patrocinadores: patrocinadores.data ?? [],
      campanhas: campanhas.data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
