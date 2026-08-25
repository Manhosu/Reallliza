import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/step-templates/{id}/purge
 *
 * O template só tinha desativação (soft-delete, `is_active=false`) — quem
 * cadastrava pra testar (Jéssica, ago/2026) não tinha como remover de
 * verdade. Excluir permanentemente bloqueia se houver OS usando o template
 * (`os_step_executions`/`service_orders.step_template_group_id`).
 */
export const DELETE = criarRotaDeExclusao<{ name?: string }>({
  tabela: "step_template_groups",
  select: "id, name",
  oQue: (r) => `o template "${r.name}"`,
  acao: "step_template_group.deleted",
});
