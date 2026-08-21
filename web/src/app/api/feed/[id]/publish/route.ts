import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { publicarPost } from "@/lib/feed/posts";

/**
 * POST /api/feed/[id]/publish
 *
 * Publica ou agenda. Publicar é ato separado de salvar porque dispara duas
 * coisas com efeito no mundo: resolve a audiência e, se pedido, enfileira
 * notificação para todo o público.
 *
 * A lógica de verdade mora em `publicarPost` (lib/feed/posts.ts) — esta
 * rota é o gatilho manual (clique em "Publicar agora"). O outro gatilho é
 * automático, de dentro de `POST /feed/campaigns/[id]/approve`: campanha
 * aprovada publica sozinha, sem passar por aqui.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = getAdminClient();

    const resultado = await publicarPost(supabase, id, user.id, body.publish_at ?? null);
    return jsonResponse(resultado);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/feed/[id]/publish — despublica (volta a rascunho).
 * Preferido a apagar: mantém histórico e métricas.
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

    const { error } = await supabase
      .from("feed_posts")
      .update({ status: "paused" })
      .eq("id", id);
    if (error) throw new Error(`Falha ao pausar: ${error.message}`);

    logAudit({
      userId: user.id,
      action: "feed_post.paused",
      entityType: "feed_post",
      entityId: id,
    });
    return jsonResponse({ id, status: "paused" });
  } catch (error) {
    return errorResponse(error);
  }
}
