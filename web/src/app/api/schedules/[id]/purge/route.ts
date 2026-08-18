import { criarRotaDeExclusao } from "@/lib/api-helpers/rota-de-exclusao";

/**
 * DELETE /api/schedules/{id}/purge
 *
 * Este cadastro não tinha exclusão nenhuma — nem física nem lógica. Quem
 * cadastrava para testar não tinha como remover.
 *
 * Apagar o agendamento não cancela a OS — são coisas diferentes, e a OS
 * continua existindo sem data marcada.
 */
export const DELETE = criarRotaDeExclusao<{ status?: string }>({
  tabela: "schedules",
  select: "id, status",
  oQue: (r) => `o agendamento`,
  acao: "schedule.deleted",
});
