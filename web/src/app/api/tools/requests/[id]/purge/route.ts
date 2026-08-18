import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/tools/requests/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 */
export const DELETE = criarRotaDeExclusao<{ status?: string }>({
  tabela: "tool_requests",
  select: "id, status",
  oQue: (r) => `o pedido de ferramenta`,
  acao: "tool_request.deleted",
});
