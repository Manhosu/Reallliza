import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { ehChamadaDeRotina } from "@/lib/api-helpers/cron-auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { getChargeStatus } from "@/lib/asaas/client";
import { confirmarPagamentoAsaas } from "@/lib/asaas/confirm-payment";

export const maxDuration = 60;

const CONFIRMED_STATUSES = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

async function authorize(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return;

  if (ehChamadaDeRotina(request)) return;

  await authenticateApiKey(request);
}

/**
 * GET|POST /api/quotes/reconcile-payments
 *
 * Rede de segurança pro webhook de pagamento. 27/08: a fila de webhooks da
 * Asaas pausou (acumulou falhas de entrega em algum momento) e três
 * orçamentos pagos de verdade ficaram presos em "aguardando pagamento" por
 * horas — ninguém avisou o sistema. Webhook por si só depende 100% da
 * Asaas conseguir ENTREGAR a chamada; isto aqui faz o caminho inverso:
 * periodicamente pergunta pra Asaas "esse pagamento pendente já foi pago
 * de verdade?" e confirma se sim, usando exatamente a mesma lógica do
 * webhook (`confirmarPagamentoAsaas`) — não um caminho paralelo.
 *
 * Olha só pagamentos/campanhas dos últimos 7 dias (janela generosa o
 * bastante pra cobrir uma fila pausada por um bom tempo, sem re-consultar
 * pra sempre um checkout abandonado de meses atrás).
 */
async function handle(request: NextRequest) {
  try {
    await authorize(request);

    const supabase = getAdminClient();
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: pagamentosPendentes }, { data: campanhasPendentes }] =
      await Promise.all([
        supabase
          .from("payments")
          .select("id, asaas_id")
          .eq("status", "pending")
          .not("asaas_id", "is", null)
          .gte("created_at", desde),
        supabase
          .from("feed_campaigns")
          .select("id, pix_asaas_id")
          .eq("payment_status", "pending")
          .not("pix_asaas_id", "is", null)
          .gte("created_at", desde),
      ]);

    const candidatos = [
      ...(pagamentosPendentes ?? []).map((p) => ({
        externalReference: p.id as string,
        asaasId: p.asaas_id as string,
        tipo: "payment" as const,
      })),
      ...(campanhasPendentes ?? []).map((c) => ({
        externalReference: c.id as string,
        asaasId: c.pix_asaas_id as string,
        tipo: "feed_campaign" as const,
      })),
    ];

    const confirmados: string[] = [];
    const erros: string[] = [];

    for (const candidato of candidatos) {
      try {
        const cobranca = await getChargeStatus(candidato.asaasId);
        if (!cobranca || !CONFIRMED_STATUSES.includes(cobranca.status)) continue;

        const resultado = await confirmarPagamentoAsaas(
          supabase,
          candidato.externalReference
        );
        if (resultado.ok && !resultado.jaConfirmado) {
          confirmados.push(`${candidato.tipo}:${candidato.externalReference}`);
        }
      } catch (err) {
        erros.push(
          `${candidato.tipo}:${candidato.externalReference} — ${
            err instanceof Error ? err.message : "erro desconhecido"
          }`
        );
      }
    }

    return jsonResponse({
      verificados: candidatos.length,
      confirmados,
      erros,
    });
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`Reconcile payments error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}

export const GET = handle;
export const POST = handle;
