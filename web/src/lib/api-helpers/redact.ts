/**
 * Remove os campos financeiros das respostas de OS conforme quem está lendo.
 *
 * Regra vigente (Jessica 14/08), que consolida os pedidos anteriores:
 *
 *  - Loja (partner)      → OS completa pra acompanhar, sem valor nenhum.
 *  - Técnico da Reallliza → OS completa pra executar, sem valor nenhum.
 *  - Prestador homologado → OS completa pra executar, sem valor de item, sem
 *                           o valor ofertado pela loja e sem o total do
 *                           orçamento. Vê só o repasse líquido dele.
 *
 * O repasse é `quotes.payout_amount` = total pago pela loja menos a taxa da
 * plataforma. No exemplo da Jessica: loja paga 1.000, plataforma retém 20%,
 * o prestador vê 800 — e nunca os 1.000.
 *
 * Isto roda no servidor de propósito: esconder no aplicativo deixaria o valor
 * viajando na resposta, a um "ver JSON" de distância.
 */

const FINANCIAL_FIELDS_OS = [
  "estimated_value",
  "final_value",
  "acrescimo",
  "desconto",
  "vale_troca",
  "total_liquido",
  "subtotal",
  "total",
];

const FINANCIAL_FIELDS_ITEM = [
  "unit_value",
  "total",
  "subtotal",
  "unit_price",
];

function stripFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): T {
  const out: Record<string, unknown> = { ...obj };
  for (const f of fields) {
    if (f in out) delete out[f];
  }
  return out as T;
}

export interface RedactContext {
  role: string | null | undefined;
  /** technician externo (professional_type=external OR is_homologated=true) */
  isHomologado?: boolean;
  /**
   * Repasse líquido do prestador nesta OS. Só é anexado para o homologado —
   * é a única informação financeira que ele pode ver.
   */
  payoutAmount?: number | null;
}

function normalizeCtx(
  ctxOrRole: RedactContext | string | null | undefined
): RedactContext {
  return typeof ctxOrRole === "string" || ctxOrRole == null
    ? { role: ctxOrRole ?? null }
    : ctxOrRole;
}

/**
 * Quem não pode ver valores. Antes o técnico próprio ficava de fora e via o
 * valor unitário e o total de cada item na tela de execução.
 */
function shouldRedact(ctx: RedactContext): boolean {
  return ctx.role === "partner" || ctx.role === "technician";
}

/** Remove valores da OS (raiz + items[]) e, pro prestador, devolve o repasse. */
export function redactOsForRole<
  T extends Record<string, unknown> & { items?: unknown }
>(row: T, ctxOrRole: RedactContext | string | null | undefined): T {
  const ctx = normalizeCtx(ctxOrRole);
  if (!shouldRedact(ctx)) return row;

  const cleaned = stripFields(row, FINANCIAL_FIELDS_OS);
  if (Array.isArray(cleaned.items)) {
    cleaned.items = (cleaned.items as Array<Record<string, unknown>>).map((it) =>
      stripFields(it, FINANCIAL_FIELDS_ITEM)
    );
  }
  if (ctx.isHomologado && ctx.payoutAmount != null) {
    (cleaned as Record<string, unknown>).payout_amount = ctx.payoutAmount;
  }
  return cleaned;
}

/** Redige um array de OSs (usado no /my). */
export function redactOsListForRole<T extends Record<string, unknown>>(
  rows: T[],
  ctxOrRole: RedactContext | string | null | undefined
): T[] {
  const ctx = normalizeCtx(ctxOrRole);
  if (!shouldRedact(ctx)) return rows;
  return rows.map((r) => redactOsForRole(r as Record<string, unknown>, ctx) as T);
}

/** Redige service_order_items retornados isoladamente. */
export function redactItemsForRole<T extends Record<string, unknown>>(
  items: T[],
  ctxOrRole: RedactContext | string | null | undefined
): T[] {
  const ctx = normalizeCtx(ctxOrRole);
  if (!shouldRedact(ctx)) return items;
  return items.map((it) => stripFields(it, FINANCIAL_FIELDS_ITEM) as T);
}
