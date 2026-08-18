import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/warranties/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 */
export const DELETE = criarRotaDeExclusao<{ description?: string; status?: string }>({
  tabela: "warranties",
  select: "id, description, status",
  oQue: (r) => `a garantia`,
  acao: "warranty.deleted",
});
