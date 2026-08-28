export const runtime = "nodejs";

import { NextRequest } from "next/server";
import sharp from "sharp";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { podeGerenciarGarantia } from "../route";

/**
 * POST /api/warranties/[id]/resolution-photos
 *
 * Upload de foto de SOLUÇÃO (Jose 27/08) — separado do `photos` que a loja
 * anexa ao abrir. Existe porque o app mobile não tem um cliente Supabase
 * Storage configurado pra upload direto como a tela web de Garantias tem
 * (`garantias/page.tsx`); aqui o app manda multipart, igual já faz em
 * `/service-orders/[id]/photos`, e o resultado é ACRESCENTADO ao array
 * `resolution_photos` da garantia em vez de virar linha em tabela própria
 * — segue o formato JSONB que a coluna já usa.
 */
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    if (!(await podeGerenciarGarantia(supabase, user, id))) {
      throw new AuthError(403, "Sem permissao pra anexar fotos nesta garantia");
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) throw new AuthError(400, "file é obrigatório");
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new AuthError(400, `Tipo de arquivo '${file.type}' não permitido`);
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new AuthError(400, "Arquivo maior que 10MB");
    }

    const { data: warranty, error: wErr } = await supabase
      .from("warranties")
      .select("resolution_photos")
      .eq("id", id)
      .maybeSingle();
    if (wErr || !warranty) throw new AuthError(404, "Garantia não encontrada");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const mainBuffer = await sharp(buffer)
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const thumbnailBuffer = await sharp(buffer)
      .resize(300, 300, { fit: "cover" })
      .webp({ quality: 70 })
      .toBuffer();

    const uuid = crypto.randomUUID();
    const mainPath = `resolution/${id}/${uuid}.webp`;
    const thumbPath = `resolution/${id}/${uuid}_thumb.webp`;

    const { error: uploadError } = await supabase.storage
      .from("warranties")
      .upload(mainPath, mainBuffer, { contentType: "image/webp" });
    if (uploadError) throw new Error(`Falha ao enviar foto: ${uploadError.message}`);

    const { error: thumbError } = await supabase.storage
      .from("warranties")
      .upload(thumbPath, thumbnailBuffer, { contentType: "image/webp" });

    const { data: { publicUrl } } = supabase.storage.from("warranties").getPublicUrl(mainPath);
    const { data: { publicUrl: thumbnailUrl } } = supabase.storage
      .from("warranties")
      .getPublicUrl(thumbPath);

    const novaFoto = {
      url: publicUrl,
      thumbnail_url: thumbError ? null : thumbnailUrl,
      storage_path: mainPath,
    };
    const atuais = (warranty.resolution_photos as unknown[]) ?? [];

    const { data: updated, error: updateError } = await supabase
      .from("warranties")
      .update({ resolution_photos: [...atuais, novaFoto] })
      .eq("id", id)
      .select("resolution_photos")
      .single();

    if (updateError || !updated) {
      await supabase.storage.from("warranties").remove([mainPath, thumbPath]);
      throw new Error(`Falha ao salvar foto: ${updateError?.message}`);
    }

    return jsonResponse(novaFoto, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
