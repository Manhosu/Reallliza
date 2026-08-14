import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Repasse líquido do prestador por OS.
 *
 * É `quotes.payout_amount`: o que a loja pagou menos a taxa da plataforma —
 * a mesma conta que o release-payout usa pra transferir. Vem da quote porque
 * a OS não guarda esse número; o vínculo é `quotes.service_order_id`.
 *
 * OS criada fora do fluxo de orçamento não tem repasse a mostrar, e aí o
 * prestador simplesmente não vê valor nenhum — melhor que mostrar zero, que
 * seria lido como "não vou receber nada".
 */
export async function resolvePayoutForOs(
  supabase: SupabaseClient,
  serviceOrderId: string
): Promise<number | null> {
  const { data } = await supabase
    .from("quotes")
    .select("payout_amount")
    .eq("service_order_id", serviceOrderId)
    .maybeSingle();
  const valor = Number((data as { payout_amount?: number } | null)?.payout_amount);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** Versão em lote, pra listas — uma consulta em vez de uma por OS. */
export async function resolvePayoutsForOsList(
  supabase: SupabaseClient,
  serviceOrderIds: string[]
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (serviceOrderIds.length === 0) return mapa;
  const { data } = await supabase
    .from("quotes")
    .select("service_order_id, payout_amount")
    .in("service_order_id", serviceOrderIds);
  for (const q of (data ?? []) as Array<{
    service_order_id: string | null;
    payout_amount: number | null;
  }>) {
    const valor = Number(q.payout_amount);
    if (q.service_order_id && Number.isFinite(valor) && valor > 0) {
      mapa.set(q.service_order_id, valor);
    }
  }
  return mapa;
}
