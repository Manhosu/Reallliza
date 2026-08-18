import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/checklists/templates/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 */
export const DELETE = criarRotaDeExclusao<{ name?: string }>({
  tabela: "checklist_templates",
  select: "id, name",
  oQue: (r) => `o checklist "${r.name}"`,
  acao: "checklist_template.deleted",
});
