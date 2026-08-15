import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

const CANAIS = ["native", "whatsapp", "copy_link", "email", "other"];

/**
 * POST /api/feed/[id]/share
 *
 * Registra o compartilhamento. Antes o aplicativo abria a folha nativa de
 * compartilhar e não gravava nada — o número simplesmente não existia.
 *
 * Não é par único: a mesma pessoa compartilha várias vezes, e cada uma conta.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = getAdminClient();

    const { data: pode } = await supabase.rpc("feed_pode_ver", {
      p_post: id,
      p_user: user.id,
    });
    if (!pode && user.role !== "admin") {
      throw new AuthError(404, "Publicação não encontrada");
    }

    const canal = CANAIS.includes(body.channel) ? body.channel : "native";
    await supabase.from("feed_post_shares").insert({
      post_id: id,
      user_id: user.id,
      channel: canal,
    });

    const { data: post } = await supabase
      .from("feed_posts")
      .select("share_count")
      .eq("id", id)
      .single();

    return jsonResponse({ share_count: post?.share_count ?? 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
