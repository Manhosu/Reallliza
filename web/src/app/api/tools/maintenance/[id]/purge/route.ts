import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/tools/maintenance/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 *
 * A regra de "manutenção em andamento não sai" mora em
 * `lib/api-helpers/travas.ts`, e não aqui, porque o pré-check de dependências
 * precisa da mesma resposta para avisar antes de a pessoa digitar o nome.
 */
export const DELETE = criarRotaDeExclusao<Record<string, unknown>>({
  tabela: "tool_maintenance",
  select: "id",
  oQue: () => `a manutenção`,
  acao: "tool_maintenance.deleted",
});
