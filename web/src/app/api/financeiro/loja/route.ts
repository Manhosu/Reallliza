import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/financeiro/loja
 * Resumo financeiro da loja parceira: KPIs do mes + lista de pagamentos.
 *
 * Resposta:
 *   {
 *     kpis: {
 *       paid_this_month: number,
 *       in_custody: number,        // modalidade homologados, aguardando repasse
 *       released: number,          // ja repassados
 *       pending: number            // quotes em awaiting_payment
 *     },
 *     payments: [{
 *       id, quote_id, quote_number, client_name, amount, status,
 *       custody_status, method, paid_at, released_at, checkout_url,
 *       modality
 *     }]
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    let partnerId: string | null = null;
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      partnerId = (p as { id?: string } | null)?.id ?? null;
      if (!partnerId) throw new AuthError(404, "Parceiro nao encontrado");
    } else if (user.role !== "admin") {
      throw new AuthError(403, "Sem permissao");
    }

    // Pagamentos com info da quote
    let paymentsQuery = supabase
      .from("payments")
      .select(
        "id, quote_id, partner_id, amount, status, custody_status, method, " +
          "paid_at, released_at, checkout_url, created_at, " +
          "platform_fee_amount, payout_amount, " +
          "quote:quotes(id, quote_number, client_name, modality)"
      )
      .order("created_at", { ascending: false });

    if (partnerId) paymentsQuery = paymentsQuery.eq("partner_id", partnerId);

    const { data: payments } = await paymentsQuery;

    // KPIs
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let paid_this_month = 0;
    let in_custody = 0;
    let released = 0;

    type Row = {
      id: string;
      amount: number;
      status: string;
      custody_status: string;
      paid_at: string | null;
      released_at: string | null;
      payout_amount: number | null;
    };

    for (const p of ((payments as unknown) as Row[] | null) ?? []) {
      const amt = Number(p.amount) || 0;
      const payout = Number(p.payout_amount) || 0;
      if (p.status === "confirmed" && p.paid_at && p.paid_at >= monthStart) {
        paid_this_month += amt;
      }
      if (p.custody_status === "held") in_custody += payout > 0 ? payout : amt;
      if (p.custody_status === "released") released += payout > 0 ? payout : amt;
    }

    // Quotes em awaiting_payment (pendentes de pagamento)
    let pendingQuery = supabase
      .from("quotes")
      .select("total_amount")
      .in("status", ["draft", "awaiting_payment"]);
    if (partnerId) pendingQuery = pendingQuery.eq("partner_id", partnerId);
    const { data: pendingQuotes } = await pendingQuery;
    const pending = ((pendingQuotes as { total_amount: number }[] | null) ?? [])
      .reduce((s, q) => s + (Number(q.total_amount) || 0), 0);

    return jsonResponse({
      kpis: {
        paid_this_month: Math.round(paid_this_month * 100) / 100,
        in_custody: Math.round(in_custody * 100) / 100,
        released: Math.round(released * 100) / 100,
        pending: Math.round(pending * 100) / 100,
      },
      payments: ((payments as unknown) as Array<
        Row & {
          quote_id: string | null;
          method: string | null;
          checkout_url: string | null;
          platform_fee_amount: number | null;
          created_at: string;
          quote: {
            id: string;
            quote_number: number;
            client_name: string;
            modality: string | null;
          } | null;
        }
      > | null) ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
