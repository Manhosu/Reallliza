import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/ratings/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 */
export const DELETE = criarRotaDeExclusao<Record<string, unknown>>({
  tabela: "professional_ratings",
  select: "id",
  oQue: (r) => `a avaliação`,
  acao: "rating.deleted",
});
