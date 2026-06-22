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

  // 5. Agendamento automatico (Fase 2 — modalidade Reallliza).
  // Jornadas de 8h por dia a partir de service_date. Se nao tem data, pula.
  if (
    quote.modality === "reallliza" &&
    quote.service_date &&
    Number(quote.total_hours) > 0
  ) {
    await scheduleReallizaJobs(supabase, os.id, {
      service_date: quote.service_date as string,
      service_time: (quote.service_time as string | null) ?? "08:00",
      total_hours: Number(quote.total_hours),
      partner_id: (quote.partner_id as string | null) ?? null,
    });
  }

  return { ok: true, service_order_id: os.id };
}

/**
 * Cria schedules em jornadas de 8h consecutivas a partir de service_date.
 * Pula domingos e feriados (busca a proxima data util).
 */
async function scheduleReallizaJobs(
  supabase: SupabaseClient,
  serviceOrderId: string,
  opts: {
    service_date: string;
    service_time: string;
    total_hours: number;
    partner_id: string | null;
  }
): Promise<void> {
  const totalDays = Math.ceil(opts.total_hours / 8);
  if (totalDays <= 0) return;

  // Feriados ativos pra pular
  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("date")
    .eq("is_active", true);
  const holidaySet = new Set(
    (holidays ?? []).map((h) => (h as { date: string }).date)
  );

  // Calcula horario de fim do bloco
  const [sh, sm] = opts.service_time.split(":").map((n) => parseInt(n, 10) || 0);
  const startMinutes = sh * 60 + sm;
  const endMinutes = Math.min(startMinutes + 8 * 60, 22 * 60); // tampa em 22h
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const startTime = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
  const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  const inserts: Array<{
    service_order_id: string;
    technician_id: string | null;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    source: string;
    notes: string;
  }> = [];

  let current = new Date(`${opts.service_date}T00:00:00`);
  let placed = 0;
  let safety = 0;
  while (placed < totalDays && safety < 90) {
    safety++;
    const dateStr = current.toISOString().slice(0, 10);
    const dow = current.getDay();
    const isSunday = dow === 0;
    const isHoliday = holidaySet.has(dateStr);
    if (!isSunday && !isHoliday) {
      inserts.push({
        service_order_id: serviceOrderId,
        technician_id: null, // admin distribui depois
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
        status: "scheduled",
        source: "quote_paid",
        notes: `Auto-agendado da quote (${placed + 1}/${totalDays})`,
      });
      placed++;
    }
    current.setDate(current.getDate() + 1);
  }

  if (inserts.length > 0) {
    await supabase.from("schedules").insert(inserts);
  }
}
