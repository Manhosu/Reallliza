import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { convertQuoteToServiceOrder } from "@/lib/quotes/convert-to-os";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
const PAID_EVENTS = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"];

/**
 * POST /api/webhook/asaas
 * Webhook do Asaas. Em PAYMENT_CONFIRMED/RECEIVED, confirma o pagamento
 * e converte o orçamento numa OS. Idempotente. Autenticado pelo header
 * `asaas-access-token` (= ASAAS_WEBHOOK_TOKEN).
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

    const { data: payment } = await supabase
      .from("payments")
      .select("id, status, quote_id, amount, kind")
      .eq("id", externalReference)
      .maybeSingle();

    if (!payment) {
      return jsonResponse({ message: "Pagamento não encontrado" }, 404);
    }
    if (payment.status === "confirmed") {
      return jsonResponse({ success: true, deduplicated: true });
    }

    const now = new Date().toISOString();
    const paymentKind =
      (payment as { kind?: string }).kind ?? "primary";

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
        newData: { event },
      });
      return jsonResponse({ success: true, topup: true });
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
        payoutAmount =
          Number((q as { payout_amount?: number }).payout_amount) || 0;
        platformFeeAmount =
          Number((q as { platform_fee_amount?: number }).platform_fee_amount) || 0;
      }
    }

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

      const result = await convertQuoteToServiceOrder(
        supabase,
        payment.quote_id
      );
      if (result.ok) {
        serviceOrderId = result.service_order_id;
      } else {
        console.error(`Asaas webhook: convert failed: ${result.error}`);
      }
    }

    logAudit({
      userId: SYSTEM_USER_ID,
      action: "payment.confirmed_webhook",
      entityType: "payment",
      entityId: payment.id,
      newData: { event, service_order_id: serviceOrderId },
    });

    return jsonResponse({ success: true, service_order_id: serviceOrderId });
  } catch (error) {
    console.error(
      `Asaas webhook error: ${
        error instanceof Error ? error.message : "unknown"
      }`
    );
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
