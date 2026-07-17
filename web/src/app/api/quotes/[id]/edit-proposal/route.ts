import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createCharge, isAsaasConfigured } from "@/lib/asaas/client";

/**
 * POST /api/quotes/[id]/edit-proposal
 *
 * Jessica 20/07: loja pode editar a proposta de homologados enquanto
 * NENHUM homologado aceitou. Se o novo valor for maior que o atual,
 * loja paga a diferenca antes da republicacao.
 *
 * Body: { new_amount: number }
 *
 * Fluxo:
 *  1. Valida quote modalidade='homologados', proposta broadcast em
 *     status='pending' e SEM accepted_by
 *  2. new_amount >= current (aumento)
 *  3. Marca a proposta atual como 'expired' com nota "aguardando pagto"
 *  4. Cria payment kind='proposal_topup' com valor = diff
 *  5. Se new_amount == current: dispara refanout imediato (sem cobrar)
 *  6. Retorna checkout_url quando ha topup
 *
 * Refanout definitivo (nova proposta broadcast + notificar homologados)
 * acontece no webhook Asaas ao confirmar o topup, OU direto aqui quando
 * nao ha topup.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const body = await request.json();
    const newAmountRaw = Number(body?.new_amount);
    if (!Number.isFinite(newAmountRaw) || newAmountRaw <= 0) {
      throw new AuthError(400, "new_amount invalido");
    }
    const newAmount = Math.round(newAmountRaw * 100) / 100;

    const supabase = getAdminClient();

    // Carrega quote
    const { data: quote } = await supabase
      .from("quotes")
      .select(
        "id, quote_number, partner_id, client_name, client_email, modality, total_amount, payout_amount, service_order_id, address_state, region_state"
      )
      .eq("id", id)
      .maybeSingle();
    if (!quote) throw new AuthError(404, "Orcamento nao encontrado");

    // So loja dona ou admin
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const myPartner = (p as { id?: string } | null)?.id;
      if (!myPartner || myPartner !== quote.partner_id) {
        throw new AuthError(403, "Sem permissao");
      }
    } else if (user.role !== "admin") {
      throw new AuthError(403, "Sem permissao");
    }

    if (quote.modality !== "homologados") {
      throw new AuthError(
        400,
        "Editar proposta so vale pra modalidade Homologados."
      );
    }

    // Procura a proposta broadcast atual dessa OS
    if (!quote.service_order_id) {
      throw new AuthError(
        400,
        "Ainda nao ha OS criada pra este orcamento — pague o orcamento primeiro."
      );
    }

    const { data: proposal } = await supabase
      .from("service_proposals")
      .select("id, status, accepted_by, offered_amount")
      .eq("service_order_id", quote.service_order_id)
      .is("partner_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!proposal) {
      throw new AuthError(404, "Nenhuma proposta encontrada pra editar.");
    }
    const p = proposal as {
      id: string;
      status: string;
      accepted_by: string | null;
      offered_amount: number | null;
    };
    if (p.accepted_by) {
      throw new AuthError(
        400,
        "Proposta ja foi aceita por um homologado — nao pode mais editar."
      );
    }
    if (p.status !== "pending") {
      throw new AuthError(
        400,
        `Proposta esta em status '${p.status}' — so pode editar quando 'pending'.`
      );
    }

    const currentAmount = Number(p.offered_amount ?? quote.payout_amount ?? 0);
    if (newAmount < currentAmount) {
      throw new AuthError(
        400,
        `Novo valor (R$ ${newAmount.toFixed(2)}) nao pode ser menor que o atual (R$ ${currentAmount.toFixed(2)}). Aumento apenas.`
      );
    }
    const diff = Math.round((newAmount - currentAmount) * 100) / 100;

    // Expira a proposta atual (com nota)
    const nowIso = new Date().toISOString();
    await supabase
      .from("service_proposals")
      .update({
        status: "expired",
        response_message: `Substituida via edicao de proposta (loja) em ${nowIso}. Novo valor: R$ ${newAmount.toFixed(2)}.`,
        updated_at: nowIso,
      })
      .eq("id", p.id);

    // Sem diferenca — refanout direto agora (sem cobrar)
    if (diff === 0) {
      const { refanoutHomologadoProposal } = await import(
        "@/lib/quotes/fanout-homologados"
      );
      await refanoutHomologadoProposal(supabase, {
        service_order_id: quote.service_order_id as string,
        target_state: (quote.region_state ?? quote.address_state) as
          | string
          | null,
        quote_number: quote.quote_number as string | number,
        client_name: quote.client_name as string,
        offered_amount: newAmount,
      });
      logAudit({
        userId: user.id,
        action: "quote.proposal_reedit_no_topup",
        entityType: "quote",
        entityId: id,
        newData: { new_amount: newAmount, previous_amount: currentAmount },
      });
      return jsonResponse({
        ok: true,
        checkout_url: null,
        needs_payment: false,
        new_amount: newAmount,
        diff: 0,
      });
    }

    // Cria payment topup
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .insert({
        quote_id: id,
        partner_id: quote.partner_id,
        amount: diff,
        status: "pending",
        kind: "proposal_topup",
        notes: `Topup pra editar proposta — novo valor R$ ${newAmount.toFixed(2)}`,
      })
      .select("id")
      .single();
    if (payErr || !payment) {
      throw new Error(`Falha ao registrar pagamento adicional: ${payErr?.message}`);
    }

    let checkoutUrl: string | null = null;
    if (isAsaasConfigured()) {
      const charge = await createCharge({
        amount: diff,
        description: `Ajuste de proposta — Orçamento #${quote.quote_number}`,
        customerName: quote.client_name as string,
        customerEmail: (quote.client_email as string | null) ?? undefined,
        externalReference: (payment as { id: string }).id,
      });
      if (charge) {
        checkoutUrl = charge.checkoutUrl;
        await supabase
          .from("payments")
          .update({
            asaas_id: charge.asaasId,
            checkout_url: charge.checkoutUrl,
          })
          .eq("id", (payment as { id: string }).id);
      }
    }

    // Guarda o novo valor no quote pra o webhook usar no refanout
    await supabase
      .from("quotes")
      .update({ payout_amount: newAmount })
      .eq("id", id);

    logAudit({
      userId: user.id,
      action: "quote.proposal_edit_started",
      entityType: "quote",
      entityId: id,
      newData: {
        new_amount: newAmount,
        previous_amount: currentAmount,
        topup_amount: diff,
        payment_id: (payment as { id: string }).id,
      },
    });

    return jsonResponse({
      ok: true,
      checkout_url: checkoutUrl,
      needs_payment: true,
      new_amount: newAmount,
      diff,
      payment_id: (payment as { id: string }).id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
