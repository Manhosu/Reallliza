import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/api-helpers/audit";
import { convertQuoteToServiceOrder } from "@/lib/quotes/convert-to-os";
import { aprovarEPublicarCampanha } from "@/lib/feed/posts";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Confirma um pagamento (orçamento ou campanha do Feed) e dispara o que
 * precisa acontecer depois — conversão em OS, refanout de proposta, ou
 * aprovação+publicação da campanha.
 *
 * Extraído de `/webhook/asaas` (27/08) pra ser chamado de dois lugares sem
 * duplicar a lógica: o webhook em si (caminho normal) E a reconciliação
 * periódica em `/api/quotes/reconcile-payments` (rede de segurança pra
 * quando a fila de webhooks da Asaas pausa — aconteceu de verdade e deixou
 * pagamentos reais presos em "aguardando pagamento" por horas). Duplicar
 * este bloco no cron faria as duas cópias divergirem no primeiro ajuste.
 *
 * Idempotente — chamar de novo pra um pagamento já confirmado é seguro.
 */
export async function confirmarPagamentoAsaas(
  supabase: SupabaseClient,
  externalReference: string
): Promise<
  | { ok: true; jaConfirmado: boolean; serviceOrderId?: string; feedCampaignId?: string }
  | { ok: false; motivo: string }
> {
  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, quote_id, amount, kind")
    .eq("id", externalReference)
    .maybeSingle();

  if (!payment) {
    // Não é orçamento — tenta campanha do Feed. A cobrança de campanha
    // nunca cria linha em `payments` (ver POST /feed/campaigns/[id]/pix):
    // o externalReference mandado pro Asaas é o próprio feed_campaigns.id.
    const { data: campanha } = await supabase
      .from("feed_campaigns")
      .select("id, payment_status, total_price_cents")
      .eq("id", externalReference)
      .maybeSingle();

    if (!campanha) {
      return { ok: false, motivo: "Pagamento não encontrado" };
    }
    if (campanha.payment_status !== "pending") {
      return { ok: true, jaConfirmado: true, feedCampaignId: campanha.id };
    }

    const agora = new Date().toISOString();
    await supabase
      .from("feed_campaigns")
      .update({
        payment_status: "paid",
        paid_at: agora,
        paid_amount_cents: campanha.total_price_cents,
        // payment_confirmed_by fica NULL de propósito: distingue
        // confirmação automática (aqui) de confirmação manual (o botão
        // /pay grava quem clicou).
      })
      .eq("id", campanha.id);

    logAudit({
      userId: SYSTEM_USER_ID,
      action: "feed_campaign.paid_webhook",
      entityType: "feed_campaign",
      entityId: campanha.id,
      newData: { source: "asaas" },
    });

    // Pagamento confirmado já aprova e publica sozinho (Karol, 21/08).
    await aprovarEPublicarCampanha(supabase, campanha.id, SYSTEM_USER_ID);

    return { ok: true, jaConfirmado: false, feedCampaignId: campanha.id };
  }

  if (payment.status === "confirmed") {
    return { ok: true, jaConfirmado: true };
  }

  const now = new Date().toISOString();
  const paymentKind = (payment as { kind?: string }).kind ?? "primary";

  // Topup de proposta (Jessica 20/07): confirma o pagamento adicional
  // e dispara refanout da proposta com o novo valor.
  if (paymentKind === "proposal_topup") {
    await supabase
      .from("payments")
      .update({ status: "confirmed", paid_at: now })
      .eq("id", payment.id);

    if (payment.quote_id) {
      const { data: q } = await supabase
        .from("quotes")
        .select(
          "quote_number, client_name, service_order_id, region_state, address_state, payout_amount, total_amount"
        )
        .eq("id", payment.quote_id)
        .maybeSingle();
      const qRow = q as {
        quote_number?: string | number;
        client_name?: string;
        service_order_id?: string;
        region_state?: string | null;
        address_state?: string | null;
        payout_amount?: number;
        total_amount?: number;
      } | null;
      if (qRow?.service_order_id) {
        const { refanoutHomologadoProposal } = await import(
          "@/lib/quotes/fanout-homologados"
        );
        await refanoutHomologadoProposal(supabase, {
          service_order_id: qRow.service_order_id,
          target_state: (qRow.region_state ?? qRow.address_state) ?? null,
          quote_number: qRow.quote_number ?? "",
          client_name: qRow.client_name ?? "",
          offered_amount: Number(qRow.payout_amount ?? qRow.total_amount ?? 0),
        });
      }
    }

    logAudit({
      userId: SYSTEM_USER_ID,
      action: "payment.topup_confirmed_refanout",
      entityType: "payment",
      entityId: payment.id,
      newData: { source: "asaas" },
    });
    return { ok: true, jaConfirmado: false };
  }

  // Carrega quote pra determinar modalidade (custodia vs direto)
  let modality: "reallliza" | "homologados" | null = null;
  let platformFeePct = 0;
  let payoutAmount = 0;
  let platformFeeAmount = 0;
  if (payment.quote_id) {
    const { data: q } = await supabase
      .from("quotes")
      .select("modality, platform_fee_pct, payout_amount, platform_fee_amount")
      .eq("id", payment.quote_id)
      .single();
    if (q) {
      modality = (q as { modality: typeof modality }).modality ?? null;
      platformFeePct =
        Number((q as { platform_fee_pct?: number }).platform_fee_pct) || 0;
      payoutAmount = Number((q as { payout_amount?: number }).payout_amount) || 0;
      platformFeeAmount =
        Number((q as { platform_fee_amount?: number }).platform_fee_amount) || 0;
    }
  }
  void platformFeePct;

  // Custodia: modalidade homologados retem o dinheiro ate OS concluir
  const custodyStatus: "held" | "not_applicable" =
    modality === "homologados" ? "held" : "not_applicable";

  await supabase
    .from("payments")
    .update({
      status: "confirmed",
      paid_at: now,
      custody_status: custodyStatus,
      platform_fee_amount: platformFeeAmount,
      payout_amount: payoutAmount,
    })
    .eq("id", payment.id);

  let serviceOrderId: string | undefined;
  if (payment.quote_id) {
    await supabase
      .from("quotes")
      .update({
        status: "paid",
        paid_at: now,
        custody_held: custodyStatus === "held",
      })
      .eq("id", payment.quote_id);

    const result = await convertQuoteToServiceOrder(supabase, payment.quote_id);
    if (result.ok) {
      serviceOrderId = result.service_order_id;
    } else {
      console.error(`confirmarPagamentoAsaas: convert failed: ${result.error}`);
    }
  }

  logAudit({
    userId: SYSTEM_USER_ID,
    action: "payment.confirmed_webhook",
    entityType: "payment",
    entityId: payment.id,
    newData: { source: "asaas", service_order_id: serviceOrderId },
  });

  return { ok: true, jaConfirmado: false, serviceOrderId };
}
