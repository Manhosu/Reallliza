/**
 * Conversão de orçamento pago em Ordem de Serviço (Marco 6 / Bloco 4).
 *
 * Chamado quando o pagamento de um orçamento é confirmado (webhook do
 * Asaas ou confirmação manual do admin). Idempotente: um orçamento já
 * convertido apenas retorna a OS existente.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface ConvertResult {
  ok: boolean;
  service_order_id?: string;
  error?: string;
}

interface QuoteItemRow {
  service_id: string | null;
  service_name: string;
  unit: string | null;
  unit_price: number;
  quantity: number;
}

export async function convertQuoteToServiceOrder(
  supabase: SupabaseClient,
  quoteId: string
): Promise<ConvertResult> {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*, items:quote_items(*)")
    .eq("id", quoteId)
    .single();

  if (error || !quote) {
    return { ok: false, error: "Orçamento não encontrado" };
  }

  // Idempotência: já convertido.
  if (quote.status === "converted" && quote.service_order_id) {
    return { ok: true, service_order_id: quote.service_order_id };
  }

  const createdBy = (quote.created_by as string | null) || SYSTEM_USER_ID;

  // 1. Cria a Ordem de Serviço (entra como pending para o admin distribuir).
  const { data: os, error: osErr } = await supabase
    .from("service_orders")
    .insert({
      title: `Orçamento #${quote.quote_number} — ${quote.client_name}`,
      status: "pending",
      partner_id: quote.partner_id,
      client_name: quote.client_name,
      client_phone: quote.client_phone,
      client_email: quote.client_email,
      address_street: quote.address_street,
      address_city: quote.address_city,
      address_state: quote.address_state,
      address_zip: quote.address_zip,
      notes: quote.notes,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (osErr || !os) {
    console.error(`convertQuote: failed to create OS: ${osErr?.message}`);
    return { ok: false, error: "Falha ao criar a Ordem de Serviço" };
  }

  // 2. Itens da OS a partir dos itens do orçamento (modelo Cenize, kind 'S').
  const items = (quote.items as QuoteItemRow[] | null) || [];
  if (items.length > 0) {
    const { error: itemsErr } = await supabase
      .from("service_order_items")
      .insert(
        items.map((it, idx) => ({
          service_order_id: os.id,
          position: idx + 1,
          kind: "S",
          service_id: it.service_id,
          description: it.service_name,
          unit: it.unit,
          unit_value: it.unit_price,
          quantity: it.quantity,
        }))
      );
    if (itemsErr) {
      // Rollback da OS se os itens falharem.
      await supabase.from("service_orders").delete().eq("id", os.id);
      console.error(`convertQuote: failed items: ${itemsErr.message}`);
      return { ok: false, error: "Falha ao criar os itens da OS" };
    }
  }

  // 3. Histórico de status.
  await supabase.from("os_status_history").insert({
    service_order_id: os.id,
    from_status: null,
    to_status: "pending",
    changed_by: createdBy,
    notes: `Gerada a partir do orçamento #${quote.quote_number}`,
  });

  // 4. Marca o orçamento como convertido.
  await supabase
    .from("quotes")
    .update({
      status: "converted",
      service_order_id: os.id,
      paid_at: quote.paid_at || new Date().toISOString(),
    })
    .eq("id", quoteId);

  return { ok: true, service_order_id: os.id };
}
