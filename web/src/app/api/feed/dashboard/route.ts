import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { resolverSponsorDoUsuario } from "@/lib/feed/sponsor-auth";

/**
 * O cliente do Supabase perde o tipo quando o `select` cresce e passa a
 * devolver uma união com o tipo de erro. Declarar o formato aqui é mais
 * honesto do que espalhar `any` pelo cálculo.
 */
interface PublicacaoResumo {
  id: string;
  title: string;
  status: string;
  published_at: string | null;
  category_id: string | null;
  sponsor_id: string | null;
  campaign_id: string | null;
  is_sponsored: boolean;
  impression_count: number;
  unique_reach: number;
  video_view_count: number;
  click_count: number;
  download_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  save_count: number;
  lead_count: number;
  conversion_count: number;
}

/**
 * GET /api/feed/dashboard — o painel geral do módulo.
 *
 * Todos os números numa chamada só: o painel abre inteiro ou não abre. Uma
 * chamada por cartão viraria vinte autenticações para montar uma tela.
 *
 * Aceita `?dias=30` para a janela e `?sponsor_id=` para recortar por
 * patrocinador — que é a forma como o Portal do Patrocinador reaproveita
 * exatamente este cálculo, sem uma segunda implementação dos mesmos números.
 *
 * `sponsor`/`partner` também podem chamar, mas nunca escolhem QUAL
 * patrocinador veem: o `sponsor_id` da query é só pro admin (que pode
 * inspecionar qualquer um). Pra quem não é admin, o recorte vem sempre de
 * `resolverSponsorDoUsuario` — o próprio vínculo em `feed_sponsor_users` —
 * senão um patrocinador conseguiria ler as métricas de outro só trocando o
 * parâmetro na URL.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor", "partner"]);
    const supabase = getAdminClient();

    const { searchParams } = new URL(request.url);
    const dias = Math.min(Math.max(Number(searchParams.get("dias") ?? 30), 1), 365);
    const patrocinador =
      user.role === "admin"
        ? searchParams.get("sponsor_id")
        : (await resolverSponsorDoUsuario(supabase, user.id)).sponsor_id;

    const desde = new Date();
    desde.setDate(desde.getDate() - dias);
    const desdeDia = desde.toISOString().slice(0, 10);

    let serie = supabase
      .from("feed_post_daily_metrics")
      .select("*")
      .gte("day", desdeDia)
      .order("day");
    if (patrocinador) serie = serie.eq("sponsor_id", patrocinador);

    let publicacoes = supabase
      .from("feed_posts")
      .select(
        "id, title, status, published_at, category_id, sponsor_id, campaign_id, is_sponsored, " +
          "impression_count, unique_reach, video_view_count, click_count, download_count, " +
          "like_count, comment_count, share_count, save_count, lead_count, conversion_count"
      )
      .neq("status", "draft");
    if (patrocinador) publicacoes = publicacoes.eq("sponsor_id", patrocinador);

    const [diario, posts, campanhas, patrocinadores, leads, horarios, categorias] =
      await Promise.all([
        serie,
        publicacoes,
        supabase.from("feed_campaigns").select("id, name, status, sponsor_id"),
        supabase.from("feed_sponsors").select("id, name, logo_url, is_active"),
        supabase.from("feed_leads").select("id, status, kind, created_at, sponsor_id"),
        // Hora e dia da semana saem do evento cru: o horário exato sempre foi
        // gravado, só ninguém tinha perguntado.
        supabase.rpc("feed_mapa_de_acesso", { p_desde: desde.toISOString() }),
        supabase.from("feed_categories").select("id, name, slug, color"),
      ]);

    const dias_ = diario.data ?? [];
    const soma = (campo: string) =>
      dias_.reduce((a, d) => a + Number((d as Record<string, unknown>)[campo] ?? 0), 0);

    const listaPosts = ((posts.data ?? []) as unknown as PublicacaoResumo[]).filter(
      (p) => !patrocinador || p.sponsor_id === patrocinador
    );
    const listaLeads = (leads.data ?? []).filter(
      (l) => !patrocinador || l.sponsor_id === patrocinador
    );

    const impressoes = soma("impressions");
    const cliques = soma("clicks");
    const alcanceUnico = new Set<string>();
    // Alcance do período: pessoas distintas, não a soma dos alcances diários —
    // somar contaria de novo quem voltou em outro dia.
    const { data: alcance } = await supabase
      .from("feed_post_daily_reach")
      .select("user_id")
      .gte("day", desdeDia);
    for (const a of alcance ?? []) alcanceUnico.add(a.user_id);

    const engajamentos =
      listaPosts.reduce(
        (a, p) =>
          a + p.like_count + p.comment_count + p.share_count + p.save_count,
        0
      ) || 0;

    const ordenarPor = (campo: keyof PublicacaoResumo, n = 5) =>
      [...listaPosts]
        .sort((a, b) => Number(b[campo] ?? 0) - Number(a[campo] ?? 0))
        .slice(0, n)
        .map((p) => ({
          id: p.id,
          title: p.title,
          valor: Number(p[campo] ?? 0),
          is_sponsored: p.is_sponsored,
        }));

    const porCategoria = new Map<string, number>();
    for (const p of listaPosts) {
      if (!p.category_id) continue;
      porCategoria.set(p.category_id, (porCategoria.get(p.category_id) ?? 0) + p.impression_count);
    }

    return jsonResponse({
      periodo: { dias, desde: desdeDia },
      totais: {
        campanhas_ativas: (campanhas.data ?? []).filter(
          (c) => c.status === "active" && (!patrocinador || c.sponsor_id === patrocinador)
        ).length,
        publicacoes: listaPosts.length,
        publicacoes_no_ar: listaPosts.filter((p) => p.status === "published").length,
        usuarios_alcancados: alcanceUnico.size,
        impressoes,
        visualizacoes: soma("views"),
        curtidas: listaPosts.reduce((a, p) => a + p.like_count, 0),
        comentarios: listaPosts.reduce((a, p) => a + p.comment_count, 0),
        compartilhamentos: listaPosts.reduce((a, p) => a + p.share_count, 0),
        salvamentos: listaPosts.reduce((a, p) => a + p.save_count, 0),
        cliques,
        downloads: soma("downloads"),
        leads: listaLeads.length,
        conversoes: listaLeads.filter((l) => l.status === "convertido").length,
        patrocinadores_ativos: (patrocinadores.data ?? []).filter((s) => s.is_active).length,
        ctr: impressoes > 0 ? Number(((cliques / impressoes) * 100).toFixed(2)) : 0,
        taxa_engajamento:
          alcanceUnico.size > 0
            ? Number(((engajamentos / alcanceUnico.size) * 100).toFixed(2))
            : 0,
      },
      evolucao_diaria: dias_.reduce((acc: Record<string, Record<string, number>>, d) => {
        const dia = String(d.day);
        const atual = acc[dia] ?? {
          impressoes: 0, visualizacoes: 0, cliques: 0, leads: 0, conversoes: 0, alcance: 0,
        };
        atual.impressoes += Number(d.impressions ?? 0);
        atual.visualizacoes += Number(d.views ?? 0);
        atual.cliques += Number(d.clicks ?? 0);
        atual.leads += Number(d.leads ?? 0);
        atual.conversoes += Number(d.conversions ?? 0);
        atual.alcance += Number(d.unique_reach ?? 0);
        acc[dia] = atual;
        return acc;
      }, {}),
      destaques: {
        mais_vistas: ordenarPor("impression_count"),
        maior_engajamento: [...listaPosts]
          .map((p) => ({
            id: p.id,
            title: p.title,
            valor: p.like_count + p.comment_count + p.share_count + p.save_count,
            is_sponsored: p.is_sponsored,
          }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5),
        videos_mais_assistidos: ordenarPor("video_view_count"),
        mais_cliques: ordenarPor("click_count"),
        mais_leads: ordenarPor("lead_count"),
      },
      campanhas_por_desempenho: (campanhas.data ?? [])
        .filter((c) => !patrocinador || c.sponsor_id === patrocinador)
        .map((c) => {
          const doPeriodo = dias_.filter((d) => d.campaign_id === c.id);
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            impressoes: doPeriodo.reduce((a, d) => a + Number(d.impressions ?? 0), 0),
            cliques: doPeriodo.reduce((a, d) => a + Number(d.clicks ?? 0), 0),
            leads: doPeriodo.reduce((a, d) => a + Number(d.leads ?? 0), 0),
          };
        })
        .sort((a, b) => b.impressoes - a.impressoes)
        .slice(0, 10),
      por_categoria: (categorias.data ?? [])
        .map((c) => ({ ...c, impressoes: porCategoria.get(c.id) ?? 0 }))
        .filter((c) => c.impressoes > 0)
        .sort((a, b) => b.impressoes - a.impressoes),
      acesso: horarios.data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
