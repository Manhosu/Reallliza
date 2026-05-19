import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createCharge, isAsaasConfigured } from "@/lib/asaas/client";

/**
 * POST /api/quotes/[id]/pay
 * Inicia o pagamento de um orçamento. Cria o registro de pagamento e,
 * se o Asaas estiver configurado, gera a cobrança e devolve o link de
 * checkout. Sem Asaas, retorna manual=true (confirmação manual do admin).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "partner"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*, partner:partners(id, user_id)")
      .eq("id", id)
      .single();

    if (error || !quote) {
      throw new AuthError(404, "Orçamento não encontrado");
    }

    // Partner só paga orçamento da própria loja.
    if (user.role === "partner") {
      const partner = quote.partner as { user_id?: string } | null;
      if (!partner || partner.user_id !== user.id) {
        throw new AuthError(403, "Sem acesso a este orçamento");
      }
    }

    if (quote.status !== "draft" && quote.status !== "awaiting_payment") {
      throw new AuthError(400, "Este orçamento não está aberto para pagamento");
    }

    // Reaproveita um pagamento pendente com checkout já gerado.
    const { data: existing } = await supabase
      .from("payments")
      .select("id, checkout_url")
      .eq("quote_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.checkout_url) {
      return jsonResponse({
        payment_id: existing.id,
        checkout_url: existing.checkout_url,
      });
    }

    // Cria o registro de pagamento.
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .insert({
        quote_id: id,
        partner_id: quote.partner_id,
        amount: quote.total_amount,
        status: "pending",
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      throw new Error("Falha ao registrar o pagamento");
    }

    let checkoutUrl: string | null = null;

    if (isAsaasConfigured()) {
      const charge = await createCharge({
        amount: Number(quote.total_amount),
        description: `Orçamento #${quote.quote_number} — Reallliza`,
        customerName: quote.client_name,
        customerEmail: quote.client_email || undefined,
        externalReference: payment.id,
      });
      if (charge) {
        checkoutUrl = charge.checkoutUrl;
        await supabase
          .from("payments")
          .update({
            asaas_id: charge.asaasId,
            checkout_url: charge.checkoutUrl,
          })
          .eq("id", payment.id);
      }
    }

    await supabase
      .from("quotes")
      .update({ status: "awaiting_payment" })
      .eq("id", id);

    logAudit({
      userId: user.id,
      action: "quote.payment_started",
      entityType: "quote",
      entityId: id,
      newData: { payment_id: payment.id, asaas: !!checkoutUrl },
    });

    return jsonResponse({
      payment_id: payment.id,
      checkout_url: checkoutUrl,
      manual: !checkoutUrl,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
