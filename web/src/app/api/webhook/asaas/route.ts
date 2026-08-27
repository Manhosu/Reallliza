import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse } from "@/lib/api-helpers/response";
import { confirmarPagamentoAsaas } from "@/lib/asaas/confirm-payment";

const PAID_EVENTS = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"];

/**
 * POST /api/webhook/asaas
 * Webhook do Asaas. Em PAYMENT_CONFIRMED/RECEIVED, confirma o pagamento
 * e converte o orçamento numa OS. Idempotente. Autenticado pelo header
 * `asaas-access-token` (= ASAAS_WEBHOOK_TOKEN).
 *
 * A lógica de confirmação mora em `confirmarPagamentoAsaas` (27/08) —
 * compartilhada com a reconciliação periódica em
 * `/api/quotes/reconcile-payments`, a rede de segurança pra quando a fila
 * de webhooks da Asaas pausa e este endpoint para de ser chamado.
 */
export async function POST(request: NextRequest) {
  try {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    const token = request.headers.get("asaas-access-token");
    if (!expected || token !== expected) {
      return jsonResponse({ message: "Unauthorized" }, 401);
    }

    const body = await request.json();
    const event = body?.event as string | undefined;
    const externalReference = body?.payment?.externalReference as
      | string
      | undefined;

    if (!event || !PAID_EVENTS.includes(event)) {
      return jsonResponse({ success: true, ignored: true });
    }
    if (!externalReference) {
      return jsonResponse({ message: "externalReference ausente" }, 400);
    }

    const supabase = getAdminClient();
    const resultado = await confirmarPagamentoAsaas(supabase, externalReference);

    if (!resultado.ok) {
      return jsonResponse({ message: resultado.motivo }, 404);
    }

    return jsonResponse({
      success: true,
      deduplicated: resultado.jaConfirmado,
      service_order_id: resultado.serviceOrderId,
      feed_campaign_id: resultado.feedCampaignId,
    });
  } catch (error) {
    console.error(
      `Asaas webhook error: ${
        error instanceof Error ? error.message : "unknown"
      }`
    );
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
