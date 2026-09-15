import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export const runtime = "nodejs";

/**
 * POST /api/courses/video-sign
 *
 * Devolve uma URL assinada pra o vídeo da aula ir DIRETO pro Storage —
 * mesmo padrão de /api/feed/media/sign. Mandar o arquivo pela função
 * serverless não funciona pra vídeo de aula: a Vercel recusa o corpo da
 * requisição bem antes desse código rodar, não importa o limite que o
 * app declare.
 *
 * Jéssica (15/09): pediu pra cadastrar o vídeo direto do aparelho/
 * computador em vez de precisar hospedar em outro lugar e colar o link.
 * Usa o bucket "courses" (migration 042), que já existe com 100MB e
 * mp4/webm liberados, só nunca tinha rota nenhuma escrevendo nele.
 */

const TAMANHO_MAX = 100 * 1024 * 1024; // alinhado ao bucket

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const { file_name, mime_type, byte_size } = body;

    if (!["video/mp4", "video/webm"].includes(String(mime_type))) {
      throw new AuthError(400, "Formato não aceito. Use MP4 ou WEBM.");
    }
    if (Number(byte_size) > TAMANHO_MAX) {
      throw new AuthError(
        400,
        `Arquivo de ${(Number(byte_size) / 1048576).toFixed(0)} MB. O limite é 100 MB.`
      );
    }

    const supabase = getAdminClient();
    const ext = String(file_name || "").split(".").pop()?.toLowerCase().slice(0, 5) || "mp4";
    const path = `lessons/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { data: assinada, error } = await supabase.storage
      .from("courses")
      .createSignedUploadUrl(path);

    if (error || !assinada) {
      console.error(`Falha ao assinar upload de vídeo: ${error?.message}`);
      throw new Error("Falha ao preparar o envio do vídeo");
    }

    const { data: publicUrlData } = supabase.storage.from("courses").getPublicUrl(path);

    return jsonResponse({
      path,
      token: assinada.token,
      bucket: "courses",
      // O cliente usa: supabase.storage.from('courses').uploadToSignedUrl(path, token, arquivo)
      public_url: publicUrlData.publicUrl,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
