import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/quality-evaluations/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 */
export const DELETE = criarRotaDeExclusao<Record<string, unknown>>({
  tabela: "quality_evaluations",
  select: "id",
  oQue: (r) => `a avaliação de qualidade`,
  acao: "quality_evaluation.deleted",
});
