import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/tools/requests/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 *
 * A regra de "pedido com unidade reservada não sai" mora em
 * `lib/api-helpers/travas.ts`, compartilhada com o pré-check.
 */
export const DELETE = criarRotaDeExclusao<Record<string, unknown>>({
  tabela: "tool_requests",
  select: "id",
  oQue: () => `o pedido de ferramenta`,
  acao: "tool_request.deleted",
});
