export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (larger for video)

/**
 * POST /api/feed/upload
 * Upload a media file (image or video) for feed posts.
 * Returns the public URL.
 * Accessible by: admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      throw new AuthError(400, "file is required");
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new AuthError(
        400,
        `Tipo de arquivo nao permitido: ${file.type}. Tipos aceitos: imagens (JPEG, PNG, WebP) e videos (MP4, WebM, MOV).`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AuthError(400, "Arquivo muito grande. Tamanho maximo: 50MB.");
    }

    const supabase = getAdminClient();

    // Generate unique file name
    const ext = file.name.split(".").pop() || "bin";
    const timestamp = Date.now();
    const fileName = `feed/${user.id}/${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error(`Failed to upload feed media: ${uploadError.message}`);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("photos").getPublicUrl(fileName);

    return jsonResponse({ url: publicUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
