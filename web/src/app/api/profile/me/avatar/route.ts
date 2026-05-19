import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const BUCKET = "avatars";

/**
 * POST /api/profile/me/avatar
 * Upload da foto de perfil do usuário autenticado. Multipart: campo `file`.
 * Sobe no bucket `avatars` e grava profiles.avatar_url.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AuthError(400, "Formulário inválido");
    }

    const file = form.get("file") as File | null;
    if (!file) {
      throw new AuthError(400, "Arquivo obrigatório");
    }
    if (!file.type.startsWith("image/")) {
      throw new AuthError(400, "Envie uma imagem");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new AuthError(400, "Imagem maior que 10MB");
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `perfil/${user.id}/foto_${Date.now()}.${ext}`;

    const supabase = getAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (upErr) {
      console.error(`Avatar upload failed: ${upErr.message}`);
      throw new Error("Falha ao enviar a foto");
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: pub.publicUrl, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (updErr) {
      throw new Error("Falha ao salvar a foto no perfil");
    }

    logAudit({
      userId: user.id,
      action: "profile.avatar_updated",
      entityType: "profile",
      entityId: user.id,
    });

    return jsonResponse({ avatar_url: pub.publicUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
