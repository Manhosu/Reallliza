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

    const round = (n: number) => Math.round(n * 100) / 100;

    return jsonResponse({
      kpis: {
        revenue_month: round(revenue_month),
        in_custody: round(in_custody),
        released: round(released),
        pending: round(pending),
        platform_fees_total: round(platform_fees_total),
      },
      payable: payableRes.data ?? [],
      receivable: receivableRes.data ?? [],
      invoices: invoicesRes.data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
