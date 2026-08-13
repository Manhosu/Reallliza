export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // alinhado ao bucket (migration 053)

const ALLOWED_KINDS = ["delivery", "return", "maintenance", "retirement", "unit"];

/**
 * POST /api/tools/upload-photo
 * Sobe uma foto de ferramenta no bucket privado `tool-photos`.
 *
 * Jessica 12/08: "quando eu vou fazer o cadastro da ferramenta e chego no
 * passo de escolher o arquivo, aparece 'Sessão expirada, faça login de novo'.
 * Já saí e entrei de novo e continua igual."
 *
 * O upload rodava no navegador com um cliente Supabase criado à parte
 * (`createClient` do supabase-js), que guarda sessão em localStorage. Só que o
 * app autentica com `createBrowserClient` do @supabase/ssr, que guarda em
 * COOKIE. Os dois nunca se enxergavam, então `getSession()` voltava vazio
 * sempre — relogar não adiantava, porque o problema não era a sessão.
 *
 * Aqui o upload passa pelo servidor com o Bearer token, igual /api/feed/upload
 * e o resto do sistema.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const kind = String(formData.get("kind") || "unit");
    const toolId = String(formData.get("tool_id") || "sem-vinculo");

    if (!file) throw new AuthError(400, "Selecione um arquivo");
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new AuthError(400, "Formato não suportado. Envie JPG, PNG, WebP ou HEIC.");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new AuthError(400, "A imagem passa de 10 MB.");
    }
    if (!ALLOWED_KINDS.includes(kind)) {
      throw new AuthError(400, "kind inválido");
    }

    const supabase = getAdminClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${kind}/${toolId}/${Date.now()}-${rand}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("tool-photos")
      .upload(path, buffer, { upsert: false, contentType: file.type });
    if (upErr) {
      console.error(`tools/upload-photo: ${upErr.message}`);
      throw new Error(`Falha no upload: ${upErr.message}`);
    }

    // O bucket é privado. A URL assinada era de 30 dias e as fotos do
    // histórico permanente quebravam depois disso — o histórico não pode
    // apagar nada, muito menos por vencimento de link. `storage_path` fica
    // guardado para permitir reassinar na leitura no futuro.
    const DEZ_ANOS = 60 * 60 * 24 * 365 * 10;
    const { data: signed, error: sErr } = await supabase.storage
      .from("tool-photos")
      .createSignedUrl(path, DEZ_ANOS);
    if (sErr || !signed) throw new Error("Falha ao gerar a URL da imagem");

    return jsonResponse({
      url: signed.signedUrl,
      name: file.name,
      storage_path: path,
      uploaded_by: user.id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
