import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/proposals/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 */
export const DELETE = criarRotaDeExclusao<{ status?: string }>({
  tabela: "service_proposals",
  select: "id, status",
  oQue: (r) => `a proposta`,
  acao: "proposal.deleted",
});
