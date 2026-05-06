import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/external/feed-posts
 * Sincroniza posts do Feed gerenciados pelo Garantias.
 * Idempotente por external_id (UUID = id do post no Garantias).
 *
 * Quando deleted=true, remove o post do Enterprise (soft delete não existe nessa tabela).
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateApiKey(request);
    const body = await request.json();

    if (!body.external_id) {
      throw new ApiKeyError(400, "external_id is required");
    }

    const supabase = getAdminClient();

    if (body.deleted) {
      const { error } = await supabase
        .from("feed_posts")
        .delete()
        .eq("id", body.external_id);

      if (error) {
        console.error(`Failed to delete feed_post: ${error.message}`);
        throw new Error("Failed to delete post");
      }

      logAudit({
        userId: SYSTEM_USER_ID,
        action: "feed_post.deleted_external",
        entityType: "feed_post",
        entityId: body.external_id,
      });

      return jsonResponse({ id: body.external_id, deleted: true });
    }

    if (!body.title) {
      throw new ApiKeyError(400, "title is required");
    }
    if (!body.content) {
      throw new ApiKeyError(400, "content is required");
    }

    const audience = body.audience || "all";
    if (!["all", "employees", "partners"].includes(audience)) {
      throw new ApiKeyError(
        400,
        "audience must be one of: all, employees, partners"
      );
    }

    const row = {
      id: body.external_id,
      author_id: SYSTEM_USER_ID,
      title: body.title,
      content: body.content,
      media_urls: Array.isArray(body.media_urls) ? body.media_urls : [],
      audience,
      is_pinned: body.is_pinned ?? false,
      is_published: body.is_published ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("feed_posts")
      .upsert(row, { onConflict: "id" })
      .select("id, title, audience, is_pinned, is_published, updated_at")
      .single();

    if (error || !data) {
      console.error(`Failed to upsert feed_post: ${error?.message}`);
      throw new Error("Failed to sync post");
    }

    logAudit({
      userId: SYSTEM_USER_ID,
      action: "feed_post.synced_external",
      entityType: "feed_post",
      entityId: data.id,
      newData: { title: body.title, audience },
    });

    return jsonResponse(data);
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`Feed sync error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
