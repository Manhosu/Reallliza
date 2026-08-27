import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/api-helpers/response";
import { buscarPreviewPublico } from "@/lib/feed/preview-publico";

/**
 * GET /api/public/feed-post/[id]
 *
 * Prévia PÚBLICA (sem autenticação) de uma publicação do Feed, para o botão
 * Compartilhar (Karol 27/08) — quem recebe o link precisa ver do que se
 * trata mesmo sem ter conta, senão o link não convence ninguém a instalar
 * o app. É por isso que existe separado do GET /api/feed/[id]: aquele
 * respeita segmentação de audiência e exige sessão; este devolve só um
 * teaser (título, resumo, capa) — ver web/src/lib/feed/preview-publico.ts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const preview = await buscarPreviewPublico(id);
  return jsonResponse(preview);
}
