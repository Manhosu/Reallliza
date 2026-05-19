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
      .select("id, status, quote_id")
      .eq("id", externalReference)
      .maybeSingle();

    if (!payment) {
      return jsonResponse({ message: "Pagamento não encontrado" }, 404);
    }
    if (payment.status === "confirmed") {
      return jsonResponse({ success: true, deduplicated: true });
    }

    const now = new Date().toISOString();

    await supabase
      .from("payments")
      .update({ status: "confirmed", paid_at: now })
      .eq("id", payment.id);

    let serviceOrderId: string | undefined;
    if (payment.quote_id) {
      await supabase
        .from("quotes")
        .update({ status: "paid", paid_at: now })
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
