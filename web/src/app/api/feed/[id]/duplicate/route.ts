import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/feed/[id]/duplicate — copia uma publicação como rascunho.
 *
 * Campanha se repete: mesma peça, outro estado, outro mês. Sem duplicar, a
 * equipe remonta mídia e segmentação na mão e erra a segmentação.
 *
 * A cópia nasce SEMPRE como rascunho, e sem nada do desempenho do original —
 * contadores, agendamento, fixação e datas de publicação ficam para trás.
 * Herdar métrica de outra publicação é o tipo de erro que só se descobre na
 * reunião de resultado.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: original } = await supabase
      .from("feed_posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!original) throw new AuthError(404, "Publicação não encontrada");

    const {
      id: _id,
      created_at: _criado,
      updated_at: _atualizado,
      published_at: _publicado,
      published_by: _publicador,
      archived_at: _arquivado,
      deleted_at: _apagado,
      publish_at: _agendado,
      pinned_until: _fixado,
      is_published: _noAr,
      is_pinned: _emDestaque,
      status: _situacao,
      sort_key: _ordem,
      // Coluna calculada pelo banco a partir de patrocinador e campanha.
      // Mandar valor para ela é erro de inserção, não escolha.
      is_sponsored: _patrocinada,
      like_count: _curtidas,
      comment_count: _comentarios,
      share_count: _compartilhamentos,
      save_count: _salvamentos,
      poll_vote_count: _votos,
      impression_count: _impressoes,
      unique_reach: _alcance,
      video_view_count: _videos,
      click_count: _cliques,
      download_count: _downloads,
      lead_count: _leads,
      conversion_count: _conversoes,
      ...herdado
    } = original as Record<string, unknown>;

    const titulo = String(original.title ?? "Publicação");
    const { data: copia, error } = await supabase
      .from("feed_posts")
      .insert({
        ...herdado,
        author_id: user.id,
        title: `${titulo} (cópia)`,
        status: "draft",
        is_published: false,
        is_pinned: false,
      })
      .select("id, title, status")
      .single();

    if (error) throw new Error(error.message);

    // Mídia e botões vêm junto: duplicar sem eles devolveria um texto solto,
    // que é justamente o trabalho que a duplicação existe para evitar.
    const [midias, botoes, enquete] = await Promise.all([
      supabase.from("feed_post_media").select("*").eq("post_id", id).order("position"),
      supabase.from("feed_post_ctas").select("*").eq("post_id", id).order("position"),
      supabase
        .from("feed_polls")
        .select("*, options:feed_poll_options!feed_poll_options_poll_id_fkey(*)")
        .eq("post_id", id)
        .maybeSingle(),
    ]);

    if (midias.data?.length) {
      await supabase.from("feed_post_media").insert(
        midias.data.map(({ id: _m, post_id: _p, created_at: _c, ...m }) => ({
          ...m,
          post_id: copia.id,
        }))
      );
    }

    if (botoes.data?.length) {
      await supabase.from("feed_post_ctas").insert(
        botoes.data.map(({ id: _b, post_id: _p, created_at: _c, click_count: _k, ...b }) => ({
          ...b,
          post_id: copia.id,
        }))
      );
    }

    if (enquete.data) {
      const {
        id: _e,
        post_id: _p,
        created_at: _c,
        total_votes: _t,
        unique_voters: _u,
        options,
        ...perguntas
      } = enquete.data as Record<string, unknown> & { options?: Record<string, unknown>[] };

      const { data: novaEnquete } = await supabase
        .from("feed_polls")
        .insert({ ...perguntas, post_id: copia.id })
        .select("id")
        .single();

      if (novaEnquete && options?.length) {
        await supabase.from("feed_poll_options").insert(
          options.map(({ id: _o, poll_id: _q, vote_count: _v, created_at: _cc, ...o }) => ({
            ...o,
            poll_id: novaEnquete.id,
          }))
        );
      }
    }

    logAudit({
      userId: user.id,
      action: "feed_post.duplicated",
      entityType: "feed_post",
      entityId: copia.id,
      newData: { origem: id, titulo: copia.title },
    });

    return jsonResponse({
      id: copia.id,
      title: copia.title,
      status: copia.status,
      midias: midias.data?.length ?? 0,
      botoes: botoes.data?.length ?? 0,
      enquete: Boolean(enquete.data),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
