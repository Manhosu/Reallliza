import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/financeiro/admin
 * Dashboard financeiro completo do admin: KPIs do mes + contas a pagar/receber + invoices.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const supabase = getAdminClient();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      paymentsRes,
      payableRes,
      receivableRes,
      invoicesRes,
      pendingQuotesRes,
      custodyRes,
    ] = await Promise.all([
      supabase
        .from("payments")
        .select("amount, status, custody_status, paid_at, platform_fee_amount, payout_amount")
        .order("paid_at", { ascending: false }),
      supabase
        .from("accounts_payable")
        .select("*")
        .order("due_date", { ascending: true }),
      supabase
        .from("accounts_receivable")
        .select("*")
        .order("due_date", { ascending: true }),
      supabase
        .from("invoices")
        .select(
          "id, numero, status, amount, issued_at, due_at, paid_at, nfe_status, nfe_pdf_url, service_order:service_orders(id, order_number, client_name)"
        )
        .order("issued_at", { ascending: false })
        .limit(100),
      supabase
        .from("quotes")
        .select("total_amount")
        .in("status", ["draft", "awaiting_payment"]),
      // Jessica 07/09: nao existia NENHUMA tela pra liberar um repasse — a
      // rota /quotes/[id]/release-payout so era alcancavel via chamada
      // manual de API. Lista os pagamentos em custodia (modalidade
      // homologados) pra existir um botao "Liberar repasse" de verdade.
      supabase
        .from("payments")
        .select(
          "id, payout_amount, platform_fee_amount, paid_at, quote:quotes!inner(id, quote_number, modality, client_name, service_order_id, service_order:service_orders(order_number, status, technician_id, technician:profiles!service_orders_technician_id_fkey(full_name)))"
        )
        .eq("custody_status", "held")
        .eq("quote.modality", "homologados")
        .order("paid_at", { ascending: true }),
    ]);

    type PaymentRow = {
      amount: number;
      status: string;
      custody_status: string;
      paid_at: string | null;
      platform_fee_amount: number | null;
      payout_amount: number | null;
    };

    const payments = ((paymentsRes.data as unknown) as PaymentRow[] | null) ?? [];

    let revenue_month = 0;
    let in_custody = 0;
    let released = 0;
    let platform_fees_total = 0;

    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      const fee = Number(p.platform_fee_amount) || 0;
      const payout = Number(p.payout_amount) || 0;
      if (p.status === "confirmed" && p.paid_at && p.paid_at >= monthStart) {
        revenue_month += amt;
      }
      if (p.custody_status === "held") in_custody += payout > 0 ? payout : amt;
      if (p.custody_status === "released") released += payout > 0 ? payout : amt;
      platform_fees_total += fee;
    }

    const pendingQuotes = ((pendingQuotesRes.data as unknown) as
      | Array<{ total_amount: number }>
      | null) ?? [];
    const pending = pendingQuotes.reduce(
      (s, q) => s + (Number(q.total_amount) || 0),
      0
    );

    type CustodyPaymentRow = {
      id: string;
      payout_amount: number | null;
      platform_fee_amount: number | null;
      paid_at: string | null;
      quote: {
        id: string;
        quote_number: number | string;
        client_name: string | null;
        service_order_id: string | null;
        service_order: {
          order_number: number | null;
          status: string;
          technician_id: string | null;
          technician: { full_name: string } | null;
        } | null;
      } | null;
    };

    const custody_pending = (
      ((custodyRes.data as unknown) as CustodyPaymentRow[] | null) ?? []
    ).map((p) => ({
      payment_id: p.id,
      quote_id: p.quote?.id ?? null,
      quote_number: p.quote?.quote_number ?? null,
      client_name: p.quote?.client_name ?? null,
      order_number: p.quote?.service_order?.order_number ?? null,
      os_status: p.quote?.service_order?.status ?? null,
      technician_name: p.quote?.service_order?.technician?.full_name ?? null,
      payout_amount: Number(p.payout_amount ?? 0),
      platform_fee_amount: Number(p.platform_fee_amount ?? 0),
      paid_at: p.paid_at,
    }));

    const round = (n: number) => Math.round(n * 100) / 100;

    return jsonResponse({
      kpis: {
        revenue_month: round(revenue_month),
        in_custody: round(in_custody),
        released: round(released),
        pending: round(pending),
        platform_fees_total: round(platform_fees_total),
      },
      custody_pending,
      payable: payableRes.data ?? [],
      receivable: receivableRes.data ?? [],
      invoices: invoicesRes.data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
