import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/** POST /api/feed/[id]/save — alterna "salvo" para o usuário. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: pode } = await supabase.rpc("feed_pode_ver", {
      p_post: id,
      p_user: user.id,
    });
    if (!pode && user.role !== "admin") {
      throw new AuthError(404, "Publicação não encontrada");
    }

    const { data: existente } = await supabase
      .from("feed_post_saves")
      .select("post_id")
      .eq("post_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existente) {
      await supabase
        .from("feed_post_saves")
        .delete()
        .eq("post_id", id)
        .eq("user_id", user.id);
    } else {
      await supabase.from("feed_post_saves").insert({ post_id: id, user_id: user.id });
    }

    const { data: post } = await supabase
      .from("feed_posts")
      .select("save_count")
      .eq("id", id)
      .single();

    return jsonResponse({ saved: !existente, save_count: post?.save_count ?? 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
