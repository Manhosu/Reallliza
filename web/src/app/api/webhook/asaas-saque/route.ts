import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/webhook/asaas-saque
 *
 * "Validação de saque via Webhook" — mecanismo de segurança do Asaas,
 * separado do webhook de pagamentos (`/webhook/asaas`). Quando habilitado
 * no painel da Asaas (Segurança → Validação de saque via Webhook), TODA
 * transferência disparada via API (é o caso do nosso `createTransfer` em
 * release-payout) fica PENDING até a Asaas chamar esta rota perguntando
 * "posso liberar essa transferência?" — e só executa se respondermos
 * `{status: "APPROVED"}`. Sem resposta válida 3x, a Asaas cancela sozinha.
 *
 * Autenticado pelo header `asaas-access-token` (= ASAAS_WITHDRAWAL_TOKEN),
 * igual ao webhook de pagamentos mas com um token PRÓPRIO — são dois
 * mecanismos de segurança distintos no painel da Asaas, cada um com seu
 * campo de token.
 *
 * Único gatilho de saque que este sistema tem hoje é `createTransfer()`
 * (release-payout) — nunca pagamos boleto, PIX QR Code ou recarga via API.
 * Por isso a regra é estrita: só aprova um TRANSFER cujo `id` já esteja
 * gravado em `payments.asaas_transfer_id` (repasse do prestador) OU
 * `payments.platform_asaas_transfer_id` (taxa administrativa da Reallliza,
 * 27/08 — release-payout agora dispara as duas transfers, independentes) —
 * ambas setadas por release-payout logo após a Asaas confirmar a criação
 * da transferência, bem antes dos ~5s que a Asaas leva pra chamar este
 * webhook. Qualquer outra coisa (saque manual pelo painel, tipo de
 * operação diferente, id desconhecido) é recusada por padrão.
 */
export async function POST(request: NextRequest) {
  try {
    const expected = process.env.ASAAS_WITHDRAWAL_TOKEN;
    const token = request.headers.get("asaas-access-token");
    if (!expected || token !== expected) {
      return jsonResponse({ message: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const type = body?.type as string | undefined;

    if (type !== "TRANSFER") {
      logAudit({
        userId: null,
        action: "asaas_saque.refused",
        entityType: "asaas_transfer",
        entityId: "unknown",
        newData: { reason: `tipo de operação não reconhecido: ${type}`, body },
      });
      return jsonResponse({
        status: "REFUSED",
        refuseReason: "Tipo de operação não reconhecido por este sistema.",
      });
    }

    const transfer = body?.transfer as
      | { id?: string; value?: number; status?: string }
      | undefined;
    const transferId = transfer?.id;

    if (!transferId) {
      return jsonResponse({
        status: "REFUSED",
        refuseReason: "Transferência sem identificador.",
      });
    }

    const supabase = getAdminClient();

    // Pode ser a transfer do prestador OU a da taxa administrativa — cada
    // pagamento liberado gera até duas transfers independentes agora.
    const [{ data: comoPrestador }, { data: comoTaxa }] = await Promise.all([
      supabase
        .from("payments")
        .select("id, payout_amount, custody_status")
        .eq("asaas_transfer_id", transferId)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("id, platform_fee_amount, custody_status")
        .eq("platform_asaas_transfer_id", transferId)
        .maybeSingle(),
    ]);

    const payment = comoPrestador ?? comoTaxa;
    const valorEsperado = comoPrestador
      ? Number((comoPrestador as { payout_amount?: number }).payout_amount ?? 0)
      : comoTaxa
        ? Number((comoTaxa as { platform_fee_amount?: number }).platform_fee_amount ?? 0)
        : 0;

    const valorConfere =
      !!payment &&
      (transfer?.value === undefined || Math.abs(valorEsperado - Number(transfer.value)) < 0.01);

    const approved = !!payment && payment.custody_status === "released" && valorConfere;

    logAudit({
      userId: null,
      action: approved ? "asaas_saque.approved" : "asaas_saque.refused",
      entityType: "asaas_transfer",
      entityId: transferId,
      newData: {
        payment_id: payment?.id ?? null,
        origem: comoPrestador ? "prestador" : comoTaxa ? "taxa_reallliza" : null,
        transfer_value: transfer?.value ?? null,
        valor_esperado: valorEsperado,
        custody_status: payment?.custody_status ?? null,
      },
    });

    if (!approved) {
      return jsonResponse({
        status: "REFUSED",
        refuseReason: "Transferência não reconhecida pelo sistema Reallliza.",
      });
    }

    return jsonResponse({ status: "APPROVED" });
  } catch (error) {
    console.error("POST /api/webhook/asaas-saque:", error);
    return jsonResponse({
      status: "REFUSED",
      refuseReason: "Erro interno ao validar a transferência.",
    });
  }
}
