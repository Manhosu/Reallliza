import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/course-categories/{id}/purge
 *
 * Exclusão física. Cursos da categoria não somem (category_id vira NULL,
 * ON DELETE SET NULL) — quem cadastrou não perde o curso, só o agrupamento.
 */
export const DELETE = criarRotaDeExclusao<{ name?: string }>({
  tabela: "course_categories",
  select: "id, name",
  oQue: (r) => `a categoria "${r.name}"`,
  acao: "course_category.deleted",
});
