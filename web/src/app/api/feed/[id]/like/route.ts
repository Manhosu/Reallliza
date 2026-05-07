import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * POST /api/feed/:id/like
 * Toggle like no post: se já curtiu, remove; senão, cria.
 * Retorna { liked: boolean, like_count: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id: postId } = await params;

    const supabase = getAdminClient();

    // Verifica se o post existe e o user pode vê-lo (audience check)
    const { data: post } = await supabase
      .from("feed_posts")
      .select("id, audience")
      .eq("id", postId)
      .eq("is_published", true)
      .maybeSingle();

    if (!post) {
      return jsonResponse({ message: "Post não encontrado" }, 404);
    }

    // Audience check
    const allowed: string[] = ["all"];
    if (user.role === "admin" || user.role === "technician") allowed.push("employees");
    if (user.role === "admin" || user.role === "partner") allowed.push("partners");
    if (!allowed.includes(post.audience)) {
      return jsonResponse({ message: "Sem permissão" }, 403);
    }

    // Toggle: tenta apagar primeiro, se nada apagar, insere
    const { data: deleted, error: delError } = await supabase
      .from("feed_post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .select("post_id");

    if (delError) {
      console.error(`Failed to toggle like: ${delError.message}`);
      return jsonResponse({ message: "Erro ao curtir" }, 500);
    }

    let liked: boolean;
    if (deleted && deleted.length > 0) {
      liked = false;
    } else {
      const { error: insError } = await supabase
        .from("feed_post_likes")
        .insert({ post_id: postId, user_id: user.id });
      if (insError && insError.code !== "23505") {
        console.error(`Failed to insert like: ${insError.message}`);
        return jsonResponse({ message: "Erro ao curtir" }, 500);
      }
      liked = true;
    }

    const { count } = await supabase
      .from("feed_post_likes")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", postId);

    return jsonResponse({ liked, like_count: count || 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
