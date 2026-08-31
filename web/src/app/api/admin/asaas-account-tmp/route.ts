import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * Diagnostico temporario (28/08) — suporte Asaas pediu o ID da conta/
 * walletId pra investigar o erro insufficient_permission. Removido depois
 * de usado, nao e' rota permanente.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) return jsonResponse({ error: "ASAAS_API_KEY não configurada" }, 400);

    const baseUrl =
      process.env.ASAAS_ENV === "production"
        ? "https://api.asaas.com/v3"
        : "https://sandbox.asaas.com/api/v3";

    const [contaRes, walletRes] = await Promise.all([
      fetch(`${baseUrl}/myAccount`, { headers: { access_token: apiKey } }),
      fetch(`${baseUrl}/myAccount/walletId`, { headers: { access_token: apiKey } }),
    ]);
    const conta = await contaRes.json();
    const wallet = await walletRes.json().catch(() => null);
    return jsonResponse({
      conta: { status: contaRes.status, data: conta },
      wallet: { status: walletRes.status, data: wallet },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
