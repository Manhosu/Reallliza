import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";
import { recalculateTechnicianScore } from "@/lib/evaluation/recalculate";

/**
 * DELETE /api/quality-evaluations/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 *
 * A avaliação de qualidade é uma das quatro fontes da nota do profissional.
 * Criar uma recalcula a nota; apagar precisava recalcular também, senão a nota
 * continuava apoiada numa avaliação que não existe mais — e a tela de
 * Qualidade, que é justamente onde se confere isso, mostraria um número que
 * não bate com nenhuma linha da lista.
 */
export const DELETE = criarRotaDeExclusao<{ technician_id?: string | null }>({
  tabela: "quality_evaluations",
  select: "id, technician_id",
  oQue: () => `a avaliação de qualidade`,
  acao: "quality_evaluation.deleted",
  aposExcluir: async (supabase, r) => {
    if (r.technician_id) await recalculateTechnicianScore(supabase, r.technician_id);
  },
});
