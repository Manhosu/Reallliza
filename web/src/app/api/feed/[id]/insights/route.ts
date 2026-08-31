import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { resolverSponsorOpcional, postPertenceAoSponsor } from "@/lib/feed/sponsor-auth";

/**
 * GET /api/feed/[id]/insights
 *
 * Desempenho de uma publicação.
 *
 * As definições estão aqui e não na tela de propósito — "alcance", "impressão"
 * e "visualização" são três coisas diferentes, e a conta precisa ser a mesma
 * em qualquer lugar que mostre o número.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    // Karol 28/08: patrocinador/loja vê o desempenho da PRÓPRIA publicação,
    // no Portal do Patrocinador — mesma checagem de posse já usada em
    // GET /api/feed/[id] (feed/leitor não precisa disso: lá tudo que
    // aparece já passou por audiência).
    if (user.role !== "admin") {
      const sponsorVinculado =
        user.role === "sponsor" || user.role === "partner"
          ? await resolverSponsorOpcional(supabase, user.id)
          : null;
      const dono = sponsorVinculado
        ? await postPertenceAoSponsor(supabase, id, sponsorVinculado)
        : false;
      if (!dono) throw new AuthError(403, "Sem permissão para ver este desempenho");
    }

    const { data: post } = await supabase
      .from("feed_posts")
      .select("id, title, published_at, like_count, comment_count, save_count, share_count, poll_vote_count")
      .eq("id", id)
      .maybeSingle();
    if (!post) throw new AuthError(404, "Publicação não encontrada");

    const [diario, porDimensao, alcance, retencao] = await Promise.all([
      supabase
        .from("feed_post_daily_metrics")
        .select("*")
        .eq("post_id", id)
        .order("day"),
      supabase
        .from("feed_post_daily_metrics_dim")
        .select("dim_type, dim_value, impressions, views, clicks")
        .eq("post_id", id),
      supabase
        .from("feed_post_reach")
        .select("user_id", { count: "exact", head: true })
        .eq("post_id", id),
      // Retenção por PESSOA. A agregação diária conta eventos, então alguém
      // que reveja o vídeo três vezes aparece como três — serve para volume,
      // não para a curva. A curva sai daqui.
      supabase
        .from("feed_video_retencao_v")
        .select("media_id, espectadores, chegaram_25, chegaram_50, chegaram_75, chegaram_100, tempo_medio_ms, percentual_medio")
        .eq("post_id", id),
    ]);

    const dias = (diario.data ?? []) as Array<Record<string, number>>;
    const soma = (campo: string) => dias.reduce((a, d) => a + Number(d[campo] ?? 0), 0);

    const impressoes = soma("impressions");
    const cliques = soma("clicks");
    const alcanceUnico = alcance.count ?? 0;
    const engajamentos =
      post.like_count + post.comment_count + post.share_count + post.save_count;

    // Recortes agregados no período inteiro.
    const recortes: Record<string, Array<{ valor: string; impressoes: number; cliques: number }>> = {};
    for (const linha of (porDimensao.data ?? []) as Array<{
      dim_type: string; dim_value: string; impressions: number; clicks: number;
    }>) {
      const lista = (recortes[linha.dim_type] ??= []);
      const existente = lista.find((x) => x.valor === linha.dim_value);
      if (existente) {
        existente.impressoes += linha.impressions;
        existente.cliques += linha.clicks;
      } else {
        lista.push({ valor: linha.dim_value, impressoes: linha.impressions, cliques: linha.clicks });
      }
    }
    for (const k of Object.keys(recortes)) {
      recortes[k].sort((a, b) => b.impressoes - a.impressoes);
    }

    return jsonResponse({
      publicacao: { id: post.id, title: post.title, published_at: post.published_at },
      totais: {
        impressoes,
        alcance_unico: alcanceUnico,
        // Quantas vezes, em média, cada pessoa alcançada viu a publicação.
        frequencia: alcanceUnico > 0 ? Number((impressoes / alcanceUnico).toFixed(2)) : 0,
        visualizacoes: soma("views"),
        reacoes: post.like_count,
        comentarios: post.comment_count,
        compartilhamentos: post.share_count,
        salvamentos: post.save_count,
        votos_enquete: post.poll_vote_count,
        cliques,
        downloads: soma("downloads"),
        // Duas taxas de clique, ambas rotuladas: entregar só uma faz a
        // reunião virar discussão sobre qual denominador foi usado.
        ctr_impressao: impressoes > 0 ? Number(((cliques / impressoes) * 100).toFixed(2)) : 0,
        ctr_alcance: alcanceUnico > 0 ? Number(((cliques / alcanceUnico) * 100).toFixed(2)) : 0,
        // Engajamento sobre alcance, não sobre impressões — é a definição
        // que o mercado usa e a que o cliente tem na cabeça.
        taxa_engajamento:
          alcanceUnico > 0 ? Number(((engajamentos / alcanceUnico) * 100).toFixed(2)) : 0,
        video: {
          inicios: soma("video_starts"),
          q25: soma("video_q25"),
          q50: soma("video_q50"),
          q75: soma("video_q75"),
          completos: soma("video_q100"),
          tempo_medio_ms:
            soma("video_starts") > 0
              ? Math.round(soma("video_watch_ms") / soma("video_starts"))
              : 0,
        },
      },
      // Uma linha por vídeo da publicação, em espectadores distintos. É a
      // curva que cai de 100% ao início até quem ficou até o fim.
      retencao_video: (retencao.data ?? []).map((r) => {
        const base = Number(r.espectadores) || 0;
        const pct = (n: number) => (base > 0 ? Number(((n / base) * 100).toFixed(1)) : 0);
        return {
          media_id: r.media_id,
          espectadores: base,
          curva: {
            inicio: 100,
            p25: pct(Number(r.chegaram_25)),
            p50: pct(Number(r.chegaram_50)),
            p75: pct(Number(r.chegaram_75)),
            p100: pct(Number(r.chegaram_100)),
          },
          assistiram_ate_o_fim: Number(r.chegaram_100) || 0,
          tempo_medio_ms: Number(r.tempo_medio_ms) || 0,
          percentual_medio: Number(r.percentual_medio) || 0,
        };
      }),
      evolucao_diaria: dias,
      recortes,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
