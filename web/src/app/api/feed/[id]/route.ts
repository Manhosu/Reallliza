import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { sincronizarBotoes, sincronizarEnquete } from "@/lib/feed/anexos";
import { resolverSponsorDoUsuario, postPertenceAoSponsor } from "@/lib/feed/sponsor-auth";

/** Campos que um sponsor pode editar no próprio rascunho — o resto é admin only. */
const CAMPOS_EDITAVEIS_POR_SPONSOR = new Set([
  "title", "content", "ctas", "publish_at", "comments_enabled",
]);

const SELECAO = `
  *,
  author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url),
  category:feed_categories(id, slug, name, icon, color),
  sponsor:feed_sponsors(id, name, logo_url, primary_color),
  campaign:feed_campaigns(id, name, status),
  audience:feed_audience_rules(id, name, estimated_size),
  media:feed_post_media!feed_post_media_post_id_fkey(*),
  ctas:feed_post_ctas!feed_post_ctas_post_id_fkey(*),
  poll:feed_polls!feed_polls_post_id_fkey(*, options:feed_poll_options!feed_poll_options_poll_id_fkey(*))
`;

/** GET /api/feed/[id] — detalhe completo, para o editor e para a tela. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: post, error } = await supabase
      .from("feed_posts")
      .select(SELECAO)
      .eq("id", id)
      .maybeSingle();

    if (error || !post) throw new AuthError(404, "Publicação não encontrada");

    // Quem não é administrador só enxerga o que é da audiência dele — senão
    // bastaria adivinhar o endereço para ler conteúdo segmentado.
    //
    // Sponsor é um caso à parte: precisa reabrir o PRÓPRIO rascunho antes de
    // pagar, e `feed_pode_ver` avalia audiência de post JÁ publicado — um
    // rascunho nunca passaria nela. Dono do post entra sempre, sem checar
    // audiência; quem não é dono cai fora mesmo que a audiência bateria.
    if (user.role === "sponsor") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      const dono = await postPertenceAoSponsor(supabase, id, sponsor_id);
      if (!dono) throw new AuthError(404, "Publicação não encontrada");
    } else if (user.role !== "admin") {
      const { data: pode } = await supabase.rpc("feed_pode_ver", {
        p_post: id,
        p_user: user.id,
      });
      if (!pode) throw new AuthError(404, "Publicação não encontrada");
    }

    const p = post as Record<string, unknown>;
    if (Array.isArray(p.media)) {
      (p.media as Array<{ position: number }>).sort((a, b) => a.position - b.position);
    }
    if (Array.isArray(p.ctas)) {
      (p.ctas as Array<{ position: number }>).sort((a, b) => a.position - b.position);
    }

    return jsonResponse(post);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/feed/[id]
 *
 * Edita a publicação. Só administrador.
 *
 * Não muda o estado de publicação: publicar, pausar e agendar passam pela
 * rota /publish, porque têm efeito no mundo (resolvem audiência e disparam
 * notificação) e misturar isso com "salvar rascunho" já causou publicação
 * acidental em outros sistemas.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor"]);
    const { id } = await params;
    const body = await request.json();
    const supabase = getAdminClient();

    const { data: atual } = await supabase
      .from("feed_posts")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!atual) throw new AuthError(404, "Publicação não encontrada");

    if (user.role === "sponsor") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      const dono = await postPertenceAoSponsor(supabase, id, sponsor_id);
      if (!dono) throw new AuthError(404, "Publicação não encontrada");
      const camposForaDaLista = Object.keys(body).filter((c) => !CAMPOS_EDITAVEIS_POR_SPONSOR.has(c));
      if (camposForaDaLista.length > 0) {
        throw new AuthError(403, `Só o administrador altera: ${camposForaDaLista.join(", ")}.`);
      }
    }

    const campos = [
      "title", "content", "category_id", "campaign_id", "sponsor_id",
      "audience_rule_id", "publish_at", "unpublish_at", "pinned_until",
      "pin_priority", "notify_on_publish", "notification_title",
      "notification_body", "comments_enabled", "reactions_enabled",
    ] as const;

    const payload: Record<string, unknown> = {};
    for (const c of campos) {
      if (c in body) payload[c] = body[c];
    }
    if ("title" in payload && !String(payload.title).trim()) {
      throw new AuthError(400, "O título não pode ficar vazio");
    }
    // Botões e enquete não entram no payload da tabela: moram em tabelas
    // próprias. Por isso não contam para o "nada a alterar" abaixo — salvar
    // só a enquete é uma edição legítima.
    const mexeuNosAnexos = "ctas" in body || "poll" in body;

    if (Object.keys(payload).length === 0 && !mexeuNosAnexos) {
      return jsonResponse({ id, inalterado: true });
    }

    const botoes = await sincronizarBotoes(supabase, id, body.ctas);
    const enquete = await sincronizarEnquete(supabase, id, body.poll);

    if (Object.keys(payload).length === 0) {
      const { data: soAnexos } = await supabase
        .from("feed_posts").select(SELECAO).eq("id", id).single();
      return jsonResponse(soAnexos);
    }

    const { data: post, error } = await supabase
      .from("feed_posts")
      .update(payload)
      .eq("id", id)
      .select(SELECAO)
      .single();

    if (error) throw new Error(`Falha ao atualizar: ${error.message}`);

    logAudit({
      userId: user.id,
      action: "feed_post.updated",
      entityType: "feed_post",
      entityId: id,
      newData: { campos: Object.keys(payload), botoes, enquete: !!enquete },
    });

    return jsonResponse(post);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/feed/[id]
 *
 * Arquiva em vez de apagar quando a publicação já foi ao ar: apagar levaria
 * junto as métricas, e o histórico de campanha é o que se presta contas ao
 * patrocinador. Rascunho que nunca foi publicado é apagado de verdade.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: post } = await supabase
      .from("feed_posts")
      .select("id, status, published_at")
      .eq("id", id)
      .maybeSingle();
    if (!post) throw new AuthError(404, "Publicação não encontrada");

    if (user.role === "sponsor") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      const dono = await postPertenceAoSponsor(supabase, id, sponsor_id);
      if (!dono) throw new AuthError(404, "Publicação não encontrada");
    }

    const jaFoiAoAr = !!post.published_at;

    if (jaFoiAoAr) {
      // Arquivar marca `archived_at` e SÓ. Antes gravava `deleted_at` junto,
      // e a leitura do feed filtra `deleted_at IS NULL` para todo mundo,
      // administrador incluído — a peça sumia da Central de Conteúdo. Pior:
      // a mensagem ao tentar republicar mandava duplicá-la, uma ação que a
      // interface não tinha como oferecer, porque a peça não estava mais lá.
      //
      // O `status` já é o que tira do ar; `deleted_at` fica reservado para
      // exclusão de verdade.
      await supabase
        .from("feed_posts")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", id);
    } else {
      await supabase.from("feed_posts").delete().eq("id", id);
    }

    logAudit({
      userId: user.id,
      action: jaFoiAoAr ? "feed_post.archived" : "feed_post.deleted",
      entityType: "feed_post",
      entityId: id,
    });

    return jsonResponse({ success: true, arquivado: jaFoiAoAr });
  } catch (error) {
    return errorResponse(error);
  }
}
