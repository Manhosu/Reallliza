import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
const VALID_CATEGORIES = [
  "INSTALACAO",
  "PERICIA",
  "FERRAMENTAS",
  "BOAS_PRATICAS",
] as const;

/**
 * POST /api/external/learning-content
 * Sincroniza vídeos de Aprendizado gerenciados pelo Garantias.
 * Idempotente por external_id (UUID = id do conteúdo no Garantias).
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
        .from("learning_content")
        .delete()
        .eq("id", body.external_id);

      if (error) {
        console.error(`Failed to delete learning_content: ${error.message}`);
        throw new Error("Failed to delete content");
      }

      logAudit({
        userId: SYSTEM_USER_ID,
        action: "learning_content.deleted_external",
        entityType: "learning_content",
        entityId: body.external_id,
      });

      return jsonResponse({ id: body.external_id, deleted: true });
    }

    if (!body.title) {
      throw new ApiKeyError(400, "title is required");
    }
    if (!body.video_url) {
      throw new ApiKeyError(400, "video_url is required");
    }
    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      throw new ApiKeyError(
        400,
        `category must be one of: ${VALID_CATEGORIES.join(", ")}`
      );
    }

    const row = {
      id: body.external_id,
      title: body.title,
      description: body.description || null,
      category: body.category,
      video_url: body.video_url,
      thumbnail_url: body.thumbnail_url || null,
      duration_sec:
        typeof body.duration_sec === "number" ? body.duration_sec : null,
      order_index:
        typeof body.order_index === "number" ? body.order_index : 0,
      is_published: body.is_published ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("learning_content")
      .upsert(row, { onConflict: "id" })
      .select("id, title, category, is_published, updated_at")
      .single();

    if (error || !data) {
      console.error(`Failed to upsert learning_content: ${error?.message}`);
      throw new Error("Failed to sync content");
    }

    logAudit({
      userId: SYSTEM_USER_ID,
      action: "learning_content.synced_external",
      entityType: "learning_content",
      entityId: data.id,
      newData: { title: body.title, category: body.category },
    });

    return jsonResponse(data);
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`Learning sync error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
