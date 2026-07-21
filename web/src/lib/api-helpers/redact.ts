/**
 * Helpers pra remover campos financeiros de responses de OS quando o
 * caller nao deve ver valores unitarios/totais dos itens.
 *
 * Jessica 10/07: OS pra loja nao pode exibir valores.
 * Jessica 20/07: OS pra homologado (que aceitou proposta broadcast) nao
 * deve mostrar valor unitario dos itens — homologado ve so o valor da
 * proposta aceita (offered_amount da service_proposals).
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
  /** true quando o technician e' homologado externo (professional_type=external OR is_homologated=true) */
  isHomologado?: boolean;
}

function shouldRedact(ctx: RedactContext): boolean {
  if (ctx.role === "partner") return true;
  if (ctx.role === "technician" && ctx.isHomologado) return true;
  return false;
}

/** Remove valores da OS (root + service_order_items[]) quando o caller nao pode ver. */
export function redactOsForRole<
  T extends Record<string, unknown> & { items?: unknown }
>(row: T, ctxOrRole: RedactContext | string | null | undefined): T {
  const ctx: RedactContext =
    typeof ctxOrRole === "string" || ctxOrRole == null
      ? { role: ctxOrRole ?? null }
      : ctxOrRole;
  if (!shouldRedact(ctx)) return row;
  const cleaned = stripFields(row, FINANCIAL_FIELDS_OS);
  if (Array.isArray(cleaned.items)) {
    cleaned.items = (cleaned.items as Array<Record<string, unknown>>).map((it) =>
      stripFields(it, FINANCIAL_FIELDS_ITEM)
    );
  }
  return cleaned;
}

/** Redige um array de OSs (usado no /my). */
export function redactOsListForRole<T extends Record<string, unknown>>(
  rows: T[],
  ctxOrRole: RedactContext | string | null | undefined
): T[] {
  const ctx: RedactContext =
    typeof ctxOrRole === "string" || ctxOrRole == null
      ? { role: ctxOrRole ?? null }
      : ctxOrRole;
  if (!shouldRedact(ctx)) return rows;
  return rows.map((r) => redactOsForRole(r as Record<string, unknown>, ctx) as T);
}

/** Redige service_order_items retornados isoladamente. */
export function redactItemsForRole<T extends Record<string, unknown>>(
  items: T[],
  ctxOrRole: RedactContext | string | null | undefined
): T[] {
  const ctx: RedactContext =
    typeof ctxOrRole === "string" || ctxOrRole == null
      ? { role: ctxOrRole ?? null }
      : ctxOrRole;
  if (!shouldRedact(ctx)) return items;
  return items.map((it) => stripFields(it, FINANCIAL_FIELDS_ITEM) as T);
}
