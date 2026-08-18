import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/tools/maintenance/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 */
export const DELETE = criarRotaDeExclusao<{ status?: string }>({
  tabela: "tool_maintenance",
  select: "id, status",
  oQue: (r) => `a manutenção`,
  acao: "tool_maintenance.deleted",
});
