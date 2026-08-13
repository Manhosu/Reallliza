import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "@/lib/api-helpers/auth";
import { canStartOn, explainInvalidStart } from "./schedule-window";

/**
 * Resolve e recalcula um orçamento a partir do corpo da requisição.
 *
 * Extraído do POST /api/quotes para ser compartilhado com o PUT: como preço,
 * horas e unidade são gravados como snapshot em `quote_items`, editar exige
 * refazer exatamente as mesmas contas — resolver os serviços do catálogo,
 * validar cobertura de UF, recalcular deslocamento/estadia/horário especial e
 * conferir se a data comporta a execução.
 *
 * Duplicar isso no PUT levaria as duas cópias a divergir no primeiro ajuste
 * de regra.
 */

export interface IncomingItem {
  service_id?: string;
  quantity?: number;
}

export interface QuoteCalcResult {
  subtotal_services: number;
  total_hours: number;
  total_days: number;
  travel_distance_km: number;
  travel_cost: number;
  stay_count: number;
  stay_cost: number;
  is_special_hour: boolean;
  special_hour_extra: number;
  total_amount: number;
  platform_fee_pct: number;
  platform_fee_amount: number;
  payout_amount: number;
}

export interface ResolvedQuote {
  itemRows: Array<{
    service_id: string;
    service_name: string;
    unit: string | null;
    unit_price: number;
    quantity: number;
  }>;
  modality: "reallliza" | "homologados" | null;
  calc: QuoteCalcResult | null;
  subtotal_services: number;
  totalFinal: number;
}

export async function resolveQuotePayload(
  supabase: SupabaseClient,
  body: Record<string, unknown>
): Promise<ResolvedQuote> {
  const items = (body.items as IncomingItem[]) ?? [];

  const serviceIds = [
    ...new Set(
      items.map((it) => it.service_id).filter((v): v is string => typeof v === "string")
    ),
  ];
  if (serviceIds.length === 0) {
    throw new AuthError(400, "Itens inválidos");
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, name, unit, commercial_price, estimated_time_hours, is_active")
    .in("id", serviceIds);

  type SvcRow = {
    id: string;
    name: string;
    unit: string;
    commercial_price: number;
    estimated_time_hours: number;
    is_active: boolean;
  };
  const byId = new Map(((services as SvcRow[] | null) || []).map((s) => [s.id, s]));

  const itemRows: ResolvedQuote["itemRows"] = [];
  const calcItems: Array<{
    service_id: string;
    quantity: number;
    commercial_price: number;
    estimated_time_hours: number;
    unit?: string;
  }> = [];
  let subtotal_services = 0;

  for (const it of items) {
    const svc = it.service_id ? byId.get(it.service_id) : undefined;
    if (!svc || !svc.is_active) {
      throw new AuthError(400, "Serviço inválido ou inativo no orçamento");
    }
    const quantity = Math.max(0, Number(it.quantity) || 0);
    if (quantity <= 0) continue;
    const unitPrice = Number(svc.commercial_price) || 0;
    subtotal_services += unitPrice * quantity;
    itemRows.push({
      service_id: svc.id,
      service_name: svc.name,
      unit: svc.unit ?? null,
      unit_price: unitPrice,
      quantity,
    });
    calcItems.push({
      service_id: svc.id,
      quantity,
      commercial_price: unitPrice,
      estimated_time_hours: Number(svc.estimated_time_hours) || 0,
      unit: svc.unit,
    });
  }

  if (itemRows.length === 0) {
    throw new AuthError(400, "Informe a quantidade dos serviços");
  }

  let modality: "reallliza" | "homologados" | null = null;
  if (body.modality === "reallliza" || body.modality === "homologados") {
    modality = body.modality;
  }

  // Cobertura de UF (Jessica 24/06)
  const uf = body.address_state ? String(body.address_state).toUpperCase() : null;
  if (uf) {
    const { isStateAvailable } = await import("./uf-scope");
    const platformOk = await isStateAvailable(uf, "platform");
    if (!platformOk) {
      throw new AuthError(
        400,
        `A plataforma ainda nao opera em ${uf}. Contate o administrador.`
      );
    }
    if (modality === "reallliza") {
      const reallizaOk = await isStateAvailable(uf, "reallliza");
      if (!reallizaOk) {
        throw new AuthError(
          400,
          `Reallliza nao atende ${uf} diretamente. Escolha "Publicar pra homologados".`
        );
      }
    }
  }

  let calc: QuoteCalcResult | null = null;
  if (modality) {
    const { calculateQuote } = await import("./calculator");
    calc = await calculateQuote({
      modality,
      items: calcItems,
      service_address_zip: (body.address_zip as string) ?? null,
      service_address_city: (body.address_city as string) ?? null,
      service_address_state: (body.address_state as string) ?? null,
      service_address_street: (body.address_street as string) ?? null,
      service_date: (body.service_date as string) ?? null,
      service_time: (body.service_time as string) ?? null,
      allow_weekend: !!body.allow_weekend,
      manual_total_amount:
        typeof body.manual_total_amount === "number" ? body.manual_total_amount : null,
    });
  }

  // Jessica 12/08: a data escolhida tem de comportar o serviço INTEIRO em dias
  // seguidos. "Se não existir sequência disponível para concluir o serviço, o
  // sistema não deve permitir aquele início de agendamento."
  if (modality === "reallliza" && body.service_date && calc) {
    const dias = Number(calc.total_days) || 0;
    if (dias > 0) {
      const { data: feriados } = await supabase
        .from("public_holidays")
        .select("date")
        .eq("is_active", true);

      const rules = {
        allowWeekend: !!body.allow_weekend,
        holidays: new Set((feriados ?? []).map((h) => (h as { date: string }).date)),
      };

      if (!canStartOn(String(body.service_date), dias, rules)) {
        throw new AuthError(
          400,
          explainInvalidStart(String(body.service_date), dias, rules)
        );
      }
    }
  }

  const totalFinal = calc
    ? calc.total_amount
    : Math.round(subtotal_services * 100) / 100;

  return { itemRows, modality, calc, subtotal_services, totalFinal };
}
