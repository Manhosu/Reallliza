import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * DELETE /api/feed/comments/:id
 * Apaga um comentário. Permitido para o autor ou admin.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id: commentId } = await params;

    const supabase = getAdminClient();
    const { data: existing } = await supabase
      .from("feed_post_comments")
      .select("id, user_id")
      .eq("id", commentId)
      .maybeSingle();

    if (!existing) {
      return jsonResponse({ message: "Comentário não encontrado" }, 404);
    }
    if (existing.user_id !== user.id && user.role !== "admin") {
      return jsonResponse({ message: "Sem permissão" }, 403);
    }

    const { error } = await supabase
      .from("feed_post_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      console.error(`Failed to delete comment: ${error.message}`);
      return jsonResponse({ message: "Erro ao apagar" }, 500);
    }

    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
