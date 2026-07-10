/**
 * Helpers pra remover campos financeiros de responses de OS quando o
 * caller e' um partner (Jessica 10/07: "OS nao pode exibir valores pra
 * loja"). Defesa server-side — nao depende de a UI esconder.
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

/** Remove valores da OS (root + service_order_items[]) quando role=partner. */
export function redactOsForRole<
  T extends Record<string, unknown> & { items?: unknown }
>(row: T, role: string | null | undefined): T {
  if (role !== "partner") return row;
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
  role: string | null | undefined
): T[] {
  if (role !== "partner") return rows;
  return rows.map((r) => redactOsForRole(r as Record<string, unknown>, role) as T);
}

/** Redige service_order_items retornados isoladamente. */
export function redactItemsForRole<T extends Record<string, unknown>>(
  items: T[],
  role: string | null | undefined
): T[] {
  if (role !== "partner") return items;
  return items.map((it) => stripFields(it, FINANCIAL_FIELDS_ITEM) as T);
}
