import { colors } from '../theme/colors';

/**
 * Regras compartilhadas do módulo Ferramentas.
 * Espelham `web/src/lib/tools/types.ts` — a situação do prazo precisa ser a
 * mesma no app e na plataforma, senão técnico e almoxarife veem coisas
 * diferentes sobre a mesma custódia.
 */

export type DeadlineSituation =
  | 'on_time'
  | 'due_today'
  | 'overdue'
  | 'return_requested'
  | 'extension_pending'
  | 'no_deadline';

export const DEADLINE_LABEL: Record<DeadlineSituation, string> = {
  on_time: 'Dentro do prazo',
  due_today: 'Vence hoje',
  overdue: 'Atrasada',
  return_requested: 'Devolução solicitada',
  extension_pending: 'Prorrogação pendente',
  no_deadline: 'Sem prazo',
};

export const DEADLINE_COLOR: Record<DeadlineSituation, string> = {
  on_time: colors.success,
  due_today: colors.warning,
  overdue: colors.danger,
  return_requested: colors.info,
  extension_pending: colors.warning,
  no_deadline: colors.textMuted,
};

export function deadlineSituation(custody: {
  expected_return_at?: string | null;
  return_requested_at?: string | null;
  has_pending_extension?: boolean;
}): DeadlineSituation {
  if (custody.has_pending_extension) return 'extension_pending';
  if (custody.return_requested_at) return 'return_requested';
  if (!custody.expected_return_at) return 'no_deadline';

  const due = new Date(custody.expected_return_at);
  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (dueDay < today) return 'overdue';
  if (dueDay === today) return 'due_today';
  return 'on_time';
}

export function daysInCustody(checkedOutAt: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(checkedOutAt).getTime()) / 86_400_000)
  );
}

/** Status de pedido, no vocabulário completo dos 8. */
export const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: 'Em análise',
  approved: 'Aprovado',
  separating: 'Separado',
  awaiting_pickup: 'Pronto para retirada',
  delivered: 'Entregue',
  released: 'Liberado',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};

export const REQUEST_STATUS_COLOR: Record<string, string> = {
  pending: colors.info,
  approved: colors.success,
  separating: colors.warning,
  awaiting_pickup: colors.warning,
  delivered: colors.success,
  released: colors.success,
  rejected: colors.danger,
  cancelled: colors.textDark,
};

export function requestStatusLabel(status: string): string {
  return REQUEST_STATUS_LABEL[status] ?? status;
}

export function requestStatusColor(status: string): string {
  return REQUEST_STATUS_COLOR[status] ?? colors.textDark;
}

/**
 * Pedidos que ainda estão em andamento para o técnico.
 * Spec seção 2: "A aba Pedidos deverá mostrar SOMENTE as solicitações que o
 * técnico ainda não recebeu" — entregue sai da aba e vira custódia.
 */
export const OPEN_REQUEST_STATUSES = [
  'pending',
  'approved',
  'separating',
  'awaiting_pickup',
  'rejected',
];

export const EVENT_LABEL: Record<string, string> = {
  entrega: 'Retirada',
  recebimento: 'Devolução',
  encerramento: 'Custódia encerrada',
  reserva: 'Reservada',
  separacao: 'Separação',
  pronta_retirada: 'Pronta para retirada',
  devolucao_solicitada: 'Devolução solicitada',
  dano: 'Dano comunicado',
  prorrogacao_solicitada: 'Prorrogação solicitada',
  prorrogacao_aprovada: 'Prorrogação aprovada',
  prorrogacao_recusada: 'Prorrogação recusada',
};
