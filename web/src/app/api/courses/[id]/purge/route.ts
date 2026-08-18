import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/courses/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 *
 * Antes só havia despublicar, e a tela chamava isso de excluir.
 */
export const DELETE = criarRotaDeExclusao<{ title?: string }>({
  tabela: "courses",
  select: "id, title",
  oQue: (r) => `o curso "${r.title}"`,
  acao: "course.deleted",
});
