import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { criarPost } from "@/lib/feed/posts";
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

    const { post, botoes, enquete } = await criarPost(supabase, user.id, body);

    logAudit({
      userId: user.id,
      action: "feed_post.created",
      entityType: "feed_post",
      entityId: post.id,
      newData: { title: post.title, status: post.status, botoes, enquete: !!enquete },
    });

    return jsonResponse(post, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
