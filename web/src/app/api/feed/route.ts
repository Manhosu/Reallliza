import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { lerFeed, decodificarCursor } from "@/lib/feed/query";

/**
 * GET /api/feed
 *
 * Feed do usuário, já filtrado pela audiência de cada publicação.
 *
 * Aceita `cursor` (recomendado) e também `page`, que fica por compatibilidade
 * com o aplicativo já instalado nos celulares — versão antiga na loja é uma
 * realidade de semanas, e quebrar o contrato deixaria o técnico sem feed.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();
    const sp = request.nextUrl.searchParams;

    const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") || "20", 10)));
    const ehAdmin = user.role === "admin";
    // Só o admin, e só pedindo, enxerga rascunho e agendado.
    const incluirNaoPublicados = ehAdmin && sp.get("include_drafts") === "true";

    const resultado = await lerFeed(supabase, user.id, incluirNaoPublicados, {
      limit,
      cursor: decodificarCursor(sp.get("cursor")),
      categoria: sp.get("category_id"),
    });

    return jsonResponse({
      data: resultado.data,
      next_cursor: resultado.next_cursor,
      has_more: resultado.has_more,
      // O app antigo lê `meta`. Sem contagem total: o count exato varria a
      // tabela a cada rolagem e não era usado para nada além de um número.
      meta: {
        page: parseInt(sp.get("page") || "1", 10),
        limit,
        has_more: resultado.has_more,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/feed
 * Cria uma publicação. Só administrador.
 *
 * Nasce como rascunho por padrão: publicar é ato separado (POST /publish),
 * porque publicar dispara audiência e notificação.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const supabase = getAdminClient();

    if (!body.title || !String(body.title).trim()) {
      throw new AuthError(400, "Informe o título da publicação");
    }
    if (!body.content || !String(body.content).trim()) {
      throw new AuthError(400, "Informe o conteúdo da publicação");
    }

    const status = ["draft", "scheduled", "published"].includes(body.status)
      ? body.status
      : "draft";

    if (status === "scheduled" && !body.publish_at) {
      throw new AuthError(400, "Publicação agendada precisa de data e hora");
    }

    // Categoria de campanha exige patrocinador — senão o selo "Patrocinado"
    // não teria de quem falar.
    if (body.category_id) {
      const { data: cat } = await supabase
        .from("feed_categories")
        .select("requires_sponsor, name")
        .eq("id", body.category_id)
        .maybeSingle();
      if (cat?.requires_sponsor && !body.campaign_id && !body.sponsor_id) {
        throw new AuthError(
          400,
          `A categoria "${cat.name}" exige vincular um patrocinador ou campanha.`
        );
      }
    }

    const payload: Record<string, unknown> = {
      author_id: user.id,
      title: String(body.title).trim(),
      content: String(body.content).trim(),
      status,
      category_id: body.category_id ?? null,
      campaign_id: body.campaign_id ?? null,
      sponsor_id: body.sponsor_id ?? null,
      audience_rule_id: body.audience_rule_id ?? null,
      publish_at: body.publish_at ?? null,
      unpublish_at: body.unpublish_at ?? null,
      pinned_until: body.pinned_until ?? null,
      pin_priority: Number(body.pin_priority) || 0,
      notify_on_publish: !!body.notify_on_publish,
      notification_title: body.notification_title ?? null,
      notification_body: body.notification_body ?? null,
      comments_enabled: body.comments_enabled !== false,
      reactions_enabled: body.reactions_enabled !== false,
      duplicated_from: body.duplicated_from ?? null,
      published_at: status === "published" ? new Date().toISOString() : null,
      published_by: status === "published" ? user.id : null,
      // A coluna antiga continua obrigatória no schema; o gatilho a mantém
      // coerente com `status`.
      is_published: status === "published",
      audience: "all",
    };

    const { data: post, error } = await supabase
      .from("feed_posts")
      .insert(payload)
      .select("*")
      .single();

    if (error || !post) {
      console.error(`Falha ao criar publicação: ${error?.message}`);
      throw new Error("Falha ao criar a publicação");
    }

    logAudit({
      userId: user.id,
      action: "feed_post.created",
      entityType: "feed_post",
      entityId: post.id,
      newData: { title: post.title, status },
    });

    return jsonResponse(post, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
