import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

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
    if (user.role !== "admin") {
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
    checkRole(user, ["admin"]);
    const { id } = await params;
    const body = await request.json();
    const supabase = getAdminClient();

    const { data: atual } = await supabase
      .from("feed_posts")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!atual) throw new AuthError(404, "Publicação não encontrada");

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
    if (Object.keys(payload).length === 0) {
      return jsonResponse({ id, inalterado: true });
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
      newData: { campos: Object.keys(payload) },
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
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: post } = await supabase
      .from("feed_posts")
      .select("id, status, published_at")
      .eq("id", id)
      .maybeSingle();
    if (!post) throw new AuthError(404, "Publicação não encontrada");

    const jaFoiAoAr = !!post.published_at;

    if (jaFoiAoAr) {
      await supabase
        .from("feed_posts")
        .update({ status: "archived", archived_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
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
