import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { getAvailability } from "@/lib/quotes/uf-scope";

/**
 * GET /api/quotes/availability?state=XX
 *
 * Retorna se a UF esta habilitada na plataforma e se a Reallliza atende
 * diretamente. Usado pelo form de novo orcamento pra decidir se mostra
 * o botao "Reallliza executa".
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const state = request.nextUrl.searchParams.get("state");
    const result = await getAvailability(state);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
