import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

const REACOES = ["like", "love", "celebrate", "insightful", "support"];

/**
 * POST /api/feed/[id]/react
 *
 * Aplica, troca ou remove a reação do usuário. Uma reação por pessoa — a
 * chave primária da tabela garante, e trocar é um upsert, não dois passos.
 *
 * O contador vem do gatilho, então a resposta lê a linha já atualizada em vez
 * de recontar.
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

    const { data: post } = await supabase
      .from("feed_posts")
      .select("id, reactions_enabled, status, audience_rule_id")
      .eq("id", id)
      .maybeSingle();
    if (!post) throw new AuthError(404, "Publicação não encontrada");
    if (!post.reactions_enabled) {
      throw new AuthError(400, "As reações estão desativadas nesta publicação");
    }

    // Reagir a algo que a pessoa não pode ver revelaria a existência do post.
    const { data: pode } = await supabase.rpc("feed_pode_ver", {
      p_post: id,
      p_user: user.id,
    });
    if (!pode && user.role !== "admin") {
      throw new AuthError(404, "Publicação não encontrada");
    }

    const reacao = body.reaction ?? "like";
    if (body.reaction !== null && !REACOES.includes(reacao)) {
      throw new AuthError(400, "Tipo de reação inválido");
    }

    const { data: atual } = await supabase
      .from("feed_post_likes")
      .select("reaction")
      .eq("post_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    let minha: string | null = null;

    if (body.reaction === null || (atual && atual.reaction === reacao)) {
      // Repetir a mesma reação desfaz — é como o gesto funciona no celular.
      await supabase
        .from("feed_post_likes")
        .delete()
        .eq("post_id", id)
        .eq("user_id", user.id);
    } else if (atual) {
      await supabase
        .from("feed_post_likes")
        .update({ reaction: reacao })
        .eq("post_id", id)
        .eq("user_id", user.id);
      minha = reacao;
    } else {
      await supabase
        .from("feed_post_likes")
        .insert({ post_id: id, user_id: user.id, reaction: reacao });
      minha = reacao;
    }

    const { data: atualizado } = await supabase
      .from("feed_posts")
      .select("like_count")
      .eq("id", id)
      .single();

    return jsonResponse({
      my_reaction: minha,
      liked: minha !== null, // o app instalado lê este campo
      like_count: atualizado?.like_count ?? 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
