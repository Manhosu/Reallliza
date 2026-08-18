import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/quotes/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 *
 * Orçamento é o começo da cadeia comercial: se ele gerou OS, a OS é quem
 * segura, e o diagnóstico dirá isso.
 */
export const DELETE = criarRotaDeExclusao<{ quote_number?: string; status?: string }>({
  tabela: "quotes",
  select: "id, quote_number, status",
  oQue: (r) => `o orçamento #${r.quote_number ?? ""}`,
  acao: "quote.deleted",
});
