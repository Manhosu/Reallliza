import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/tools/units/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 */
export const DELETE = criarRotaDeExclusao<{ code?: string; serial_number?: string; status?: string }>({
  tabela: "tool_units",
  select: "id, code, serial_number, status",
  oQue: (r) => `a unidade ${r.code ?? r.serial_number ?? ""}`,
  acao: "tool_unit.deleted",
});
