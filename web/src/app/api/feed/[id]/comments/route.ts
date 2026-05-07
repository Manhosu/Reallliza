import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * GET /api/feed/:id/comments
 * Lista comentários de um post (ordem cronológica).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id: postId } = await params;

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("feed_post_comments")
      .select(
        `
        id,
        post_id,
        user_id,
        content,
        created_at,
        updated_at,
        user:profiles!feed_post_comments_user_id_fkey(id, full_name, avatar_url, role)
      `
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(`Failed to list comments: ${error.message}`);
      return jsonResponse({ message: "Erro ao listar comentários" }, 500);
    }

    return jsonResponse({ data: data || [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/feed/:id/comments
 * Cria um comentário em um post.
 * Body: { content: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id: postId } = await params;

    const body = await request.json();
    const content = (body.content || "").trim();

    if (!content) {
      return jsonResponse(
        { message: "Conteúdo do comentário é obrigatório" },
        400
      );
    }
    if (content.length > 2000) {
      return jsonResponse(
        { message: "Comentário muito longo (máx. 2000 caracteres)" },
        400
      );
    }

    const supabase = getAdminClient();

    // Verifica que o post existe + audience
    const { data: post } = await supabase
      .from("feed_posts")
      .select("id, audience, author_id, title")
      .eq("id", postId)
      .eq("is_published", true)
      .maybeSingle();

    if (!post) {
      return jsonResponse({ message: "Post não encontrado" }, 404);
    }

    const allowed: string[] = ["all"];
    if (user.role === "admin" || user.role === "technician") allowed.push("employees");
    if (user.role === "admin" || user.role === "partner") allowed.push("partners");
    if (!allowed.includes(post.audience)) {
      return jsonResponse({ message: "Sem permissão" }, 403);
    }

    const { data: comment, error } = await supabase
      .from("feed_post_comments")
      .insert({
        post_id: postId,
        user_id: user.id,
        content,
      })
      .select(
        `
        id,
        post_id,
        user_id,
        content,
        created_at,
        updated_at,
        user:profiles!feed_post_comments_user_id_fkey(id, full_name, avatar_url, role)
      `
      )
      .single();

    if (error || !comment) {
      console.error(`Failed to create comment: ${error?.message}`);
      return jsonResponse({ message: "Erro ao comentar" }, 500);
    }

    // Notifica autor do post (se não for o próprio user)
    if (post.author_id && post.author_id !== user.id) {
      createNotification(
        post.author_id,
        `${user.full_name || "Alguém"} comentou no seu post`,
        content.substring(0, 100),
        "general",
        { feed_post_id: postId, comment_id: comment.id }
      ).catch(() => {});
    }

    return jsonResponse(comment, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
