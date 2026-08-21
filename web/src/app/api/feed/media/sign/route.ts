import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { resolverSponsorDoUsuario, postPertenceAoSponsor } from "@/lib/feed/sponsor-auth";

export const runtime = "nodejs";

/**
 * POST /api/feed/media/sign
 *
 * Devolve uma URL assinada para o arquivo ir DIRETO ao armazenamento.
 *
 * O caminho anterior mandava o arquivo inteiro pela função serverless, que
 * declarava aceitar 200 MB — mas a plataforma limita o corpo da requisição a
 * poucos megabytes. Qualquer vídeo era recusado antes de o código rodar.
 *
 * A linha de mídia nasce como `pending`: sem ela não haveria onde registrar
 * a confirmação do envio, nem como limpar arquivo órfão depois.
 */

const TIPOS: Record<string, "image" | "video" | "document"> = {
  "image/jpeg": "image", "image/jpg": "image", "image/png": "image",
  "image/webp": "image", "image/gif": "image",
  "video/mp4": "video", "video/webm": "video",
  "application/pdf": "document",
};

const TAMANHO_MAX = 100 * 1024 * 1024; // alinhado ao bucket (migration 066)

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "sponsor"]);

    const body = await request.json();
    const supabase = getAdminClient();

    const { post_id, mime_type, byte_size, file_name } = body;
    if (!post_id) throw new AuthError(400, "Informe a publicação");

    const kind = TIPOS[String(mime_type)];
    if (!kind) {
      throw new AuthError(
        400,
        // .mov e .mkv ficam fora de propósito: o .mov do iPhone costuma ser
        // HEVC, que boa parte dos Android não toca. Recusar no envio é melhor
        // que aceitar e o técnico ver uma tela preta em campo.
        `Formato não aceito. Use JPG, PNG, WEBP, GIF, MP4, WEBM ou PDF.`
      );
    }
    if (Number(byte_size) > TAMANHO_MAX) {
      throw new AuthError(
        400,
        `Arquivo de ${(Number(byte_size) / 1048576).toFixed(0)} MB. O limite é 100 MB.`
      );
    }

    const { data: post } = await supabase
      .from("feed_posts")
      .select("id")
      .eq("id", post_id)
      .maybeSingle();
    if (!post) throw new AuthError(404, "Publicação não encontrada");

    if (user.role === "sponsor") {
      const { sponsor_id } = await resolverSponsorDoUsuario(supabase, user.id);
      const dono = await postPertenceAoSponsor(supabase, post_id, sponsor_id);
      if (!dono) throw new AuthError(404, "Publicação não encontrada");
    }

    const { data: ultima } = await supabase
      .from("feed_post_media")
      .select("position")
      .eq("post_id", post_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (ultima?.position ?? -1) + 1;

    const ext = String(file_name || "").split(".").pop()?.toLowerCase().slice(0, 5) || "bin";
    const path = `${post_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { data: assinada, error: errSign } = await supabase.storage
      .from("feed")
      .createSignedUploadUrl(path);

    if (errSign || !assinada) {
      console.error(`Falha ao assinar upload: ${errSign?.message}`);
      throw new Error("Falha ao preparar o envio do arquivo");
    }

    const { data: midia, error: errIns } = await supabase
      .from("feed_post_media")
      .insert({
        post_id,
        position,
        kind,
        storage_bucket: "feed",
        storage_path: path,
        mime_type,
        byte_size: Number(byte_size) || null,
        file_name: file_name ?? null,
        status: "pending",
        uploaded_by: user.id,
      })
      .select("id, position, kind")
      .single();

    if (errIns || !midia) {
      throw new Error(`Falha ao registrar a mídia: ${errIns?.message}`);
    }

    return jsonResponse({
      media_id: midia.id,
      position: midia.position,
      kind: midia.kind,
      path,
      token: assinada.token,
      // O cliente usa: supabase.storage.from('feed').uploadToSignedUrl(path, token, arquivo)
      bucket: "feed",
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
