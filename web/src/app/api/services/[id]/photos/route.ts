import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/services/[id]/photos
 * Faz upload de uma foto pro bucket `service-catalog` e adiciona ao array
 * `photos` do servico. Apenas admin. Body: multipart/form-data com field `file`.
 *
 * Retorna o servico atualizado com a nova foto inclusa.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      throw new AuthError(400, "Arquivo nao enviado");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      throw new AuthError(
        400,
        `Tipo nao suportado: ${file.type}. Aceitos: JPG, PNG, WebP, GIF.`
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new AuthError(400, "Foto maior que 10MB.");
    }

    const supabase = getAdminClient();

    // Servico precisa existir
    const { data: service, error: svcErr } = await supabase
      .from("services")
      .select("id, photos")
      .eq("id", id)
      .single();

    if (svcErr || !service) {
      throw new AuthError(404, "Servico nao encontrado");
    }

    // Upload — path: <serviceId>/<timestamp>.<ext>
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${id}/${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await supabase.storage
      .from("service-catalog")
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      console.error("Service photo upload failed:", uploadErr);
      throw new Error("Falha no upload da foto");
    }

    const { data: pub } = supabase.storage.from("service-catalog").getPublicUrl(path);
    const url = pub.publicUrl;

    const existing = Array.isArray(service.photos)
      ? (service.photos as Array<{ url: string; position?: number }>)
      : [];
    const nextPosition = existing.length;

    const newPhoto = {
      url,
      thumbnail_url: url,
      position: nextPosition,
      alt_text: null,
      storage_path: path,
    };

    const { data: updated, error: updErr } = await supabase
      .from("services")
      .update({ photos: [...existing, newPhoto] })
      .eq("id", id)
      .select("*, category:service_categories(id, name)")
      .single();

    if (updErr) {
      // Rollback: remove o arquivo do storage pra nao orfa
      await supabase.storage.from("service-catalog").remove([path]).catch(() => {});
      throw new Error("Falha ao registrar foto no servico");
    }

    logAudit({
      userId: user.id,
      action: "service.photo_added",
      entityType: "service",
      entityId: id,
      newData: { url, position: nextPosition },
    });

    return jsonResponse(updated, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/services/[id]/photos?position=N
 * Remove uma foto pelo position. Tambem remove do storage se houver
 * storage_path no item.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const positionParam = request.nextUrl.searchParams.get("position");
    if (positionParam === null) {
      throw new AuthError(400, "Parametro position obrigatorio");
    }
    const position = parseInt(positionParam, 10);
    if (!Number.isFinite(position) || position < 0) {
      throw new AuthError(400, "position invalido");
    }

    const supabase = getAdminClient();

    const { data: service, error: svcErr } = await supabase
      .from("services")
      .select("id, photos")
      .eq("id", id)
      .single();

    if (svcErr || !service) {
      throw new AuthError(404, "Servico nao encontrado");
    }

    const photos = Array.isArray(service.photos)
      ? (service.photos as Array<{
          url: string;
          position?: number;
          storage_path?: string;
        }>)
      : [];

    const removed = photos.find((p) => (p.position ?? -1) === position);
    if (!removed) {
      throw new AuthError(404, "Foto nessa posicao nao encontrada");
    }

    const remaining = photos
      .filter((p) => (p.position ?? -1) !== position)
      .map((p, idx) => ({ ...p, position: idx }));

    const { data: updated, error: updErr } = await supabase
      .from("services")
      .update({ photos: remaining })
      .eq("id", id)
      .select("*, category:service_categories(id, name)")
      .single();

    if (updErr) {
      throw new Error("Falha ao remover foto do servico");
    }

    // Best-effort cleanup do storage
    if (removed.storage_path) {
      await supabase.storage
        .from("service-catalog")
        .remove([removed.storage_path])
        .catch(() => {});
    }

    logAudit({
      userId: user.id,
      action: "service.photo_removed",
      entityType: "service",
      entityId: id,
      newData: { url: removed.url, position },
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
