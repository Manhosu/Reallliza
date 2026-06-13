/**
 * Helpers de formatação de data resistentes a fuso horário.
 *
 * Motivação: `new Date("2026-06-10")` é parseado pelo runtime como
 * `2026-06-10T00:00:00Z` (UTC midnight). Em qualquer fuso UTC- (Brasil é
 * UTC-3), `toLocaleDateString` exibe o dia anterior. Como o Postgres grava
 * campos DATE como string `YYYY-MM-DD`, precisamos parsear como horário
 * local.
 */

/** Detecta strings ISO date-only no padrão `YYYY-MM-DD`. */
function isDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Constrói Date no fuso local para uma string YYYY-MM-DD. */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formata data sem hora — `2026-06-10` → `10/06/2026`.
 * Aceita tanto date-only quanto ISO completo. Para date-only, parseia local.
 */
export function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = isDateOnly(dateStr) ? parseLocalDate(dateStr) : new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formata data + hora. Aceita ISO completo (timestamp do Postgres).
 * Para date-only, devolve só a data com `00:00`.
 */
export function formatDateTimeBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = isDateOnly(dateStr) ? parseLocalDate(dateStr) : new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
