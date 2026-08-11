/**
 * Tipos do almoxarifado (spec 06/08).
 *
 * Ficam aqui e não em `lib/types.ts` porque descrevem o modelo novo — tipo,
 * unidade física, evento — e o arquivo global já está grande.
 */

import type { ToolCondition, ToolInventory } from "@/lib/types";

/** Como um TIPO de ferramenta é controlado. */
export type TrackingMode = "controlled" | "quantity";

/**
 * Situação de uma unidade física. Espelha o enum `tool_status` do banco,
 * que a migration 053 já havia estendido.
 */
export type UnitStatus =
  | "available"
  | "reserved"
  | "in_custody"
  | "maintenance"
  | "damaged"
  | "awaiting_evaluation"
  | "missing"
  | "retired";

export const UNIT_STATUS_LABELS: Record<string, string> = {
  available: "Disponível",
  reserved: "Reservada",
  in_custody: "Em custódia",
  maintenance: "Em manutenção",
  damaged: "Danificada",
  awaiting_evaluation: "Aguardando avaliação",
  missing: "Extraviada",
  retired: "Baixada",
};

/** Situação do prazo de uma custódia (spec seções 4 e 15). */
export type DeadlineSituation =
  | "on_time"
  | "due_today"
  | "overdue"
  | "return_requested"
  | "extension_pending"
  | "no_deadline";

export const DEADLINE_LABELS: Record<DeadlineSituation, string> = {
  on_time: "Dentro do prazo",
  due_today: "Vence hoje",
  overdue: "Atrasada",
  return_requested: "Devolução solicitada",
  extension_pending: "Prorrogação pendente",
  no_deadline: "Sem prazo",
};

/** Os 9 status de manutenção da seção 21. */
export type MaintenanceStatus =
  | "awaiting_evaluation"
  | "diagnosing"
  | "awaiting_approval"
  | "repairing"
  | "awaiting_part"
  | "testing"
  | "completed"
  | "unrepairable"
  | "sent_to_retirement";

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  awaiting_evaluation: "Aguardando avaliação",
  diagnosing: "Em diagnóstico",
  awaiting_approval: "Aguardando aprovação",
  repairing: "Em reparo",
  awaiting_part: "Aguardando peça",
  testing: "Em teste",
  completed: "Concluída",
  unrepairable: "Sem reparo",
  sent_to_retirement: "Encaminhada para baixa",
};

/** Os 9 motivos de baixa da seção 22. */
export type RetirementReason =
  | "inutilizacao"
  | "obsolescencia"
  | "extravio"
  | "roubo"
  | "perda"
  | "descarte"
  | "venda"
  | "sinistro"
  | "sem_reparo";

export const RETIREMENT_REASON_LABELS: Record<RetirementReason, string> = {
  inutilizacao: "Inutilização",
  obsolescencia: "Obsolescência",
  extravio: "Extravio",
  roubo: "Roubo",
  perda: "Perda",
  descarte: "Descarte",
  venda: "Venda",
  sinistro: "Sinistro",
  sem_reparo: "Sem possibilidade de reparo",
};

export interface PhotoRef {
  url: string;
  name: string;
  storage_path?: string;
}

export interface ToolUnit {
  id: string;
  tool_id: string;
  code: string;
  patrimony_code: string | null;
  serial_number: string | null;
  status: UnitStatus;
  condition: ToolCondition;
  location: string | null;
  supplier: string | null;
  acquired_at: string | null;
  acquisition_value: number | null;
  photos: PhotoRef[];
  notes: string | null;
  reserved_for_request_id: string | null;
  created_at: string;
  updated_at: string;
  /** Preenchido nos endpoints que fazem embed do tipo. */
  tool?: Pick<ToolInventory, "id" | "name" | "category"> & {
    brand?: string | null;
    model?: string | null;
  };
}

/** Um evento do histórico permanente. */
export interface ToolEvent {
  id: string;
  tool_id: string;
  unit_id: string | null;
  event_type: string;
  description: string | null;
  status_from: string | null;
  status_to: string | null;
  technician_id: string | null;
  almoxarife_id: string | null;
  actor_id: string | null;
  service_order_id: string | null;
  custody_id: string | null;
  request_id: string | null;
  condition: ToolCondition | null;
  notes: string | null;
  photos: PhotoRef[];
  metadata: Record<string, unknown>;
  created_at: string;
  technician?: { id: string; full_name: string } | null;
  almoxarife?: { id: string; full_name: string } | null;
  service_order?: { id: string; order_number: string; title: string } | null;
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  cadastro: "Cadastro",
  edicao: "Alteração cadastral",
  pedido_criado: "Pedido registrado",
  pedido_aprovado: "Pedido aprovado",
  pedido_recusado: "Pedido recusado",
  pedido_cancelado: "Pedido cancelado",
  reserva: "Unidade reservada",
  separacao: "Separação",
  pronta_retirada: "Pronta para retirada",
  entrega: "Entrega",
  prorrogacao_solicitada: "Prorrogação solicitada",
  prorrogacao_aprovada: "Prorrogação aprovada",
  prorrogacao_recusada: "Prorrogação recusada",
  devolucao_solicitada: "Devolução solicitada",
  recebimento: "Devolução recebida",
  encerramento: "Custódia encerrada",
  dano: "Dano comunicado",
  perda: "Perda",
  extravio: "Extravio",
  manutencao_entrada: "Entrada em manutenção",
  manutencao_status: "Manutenção atualizada",
  manutencao_concluida: "Manutenção concluída",
  baixa: "Baixa",
  baixa_revertida: "Baixa revertida",
  correcao: "Correção",
};

export interface ToolExtensionRequest {
  id: string;
  custody_id: string;
  requested_by: string;
  current_return_at: string | null;
  requested_return_at: string;
  approved_return_at: string | null;
  justification: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  created_at: string;
}

/**
 * Calcula a situação do prazo de uma custódia.
 * Centralizado aqui porque web e app precisam da mesma regra.
 */
export function deadlineSituation(custody: {
  expected_return_at?: string | null;
  checked_in_at?: string | null;
  return_requested_at?: string | null;
  has_pending_extension?: boolean;
}): DeadlineSituation {
  if (custody.has_pending_extension) return "extension_pending";
  if (custody.return_requested_at) return "return_requested";
  if (!custody.expected_return_at) return "no_deadline";

  const due = new Date(custody.expected_return_at);
  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (dueDay.getTime() < today.getTime()) return "overdue";
  if (dueDay.getTime() === today.getTime()) return "due_today";
  return "on_time";
}

/** Dias corridos desde a retirada. */
export function daysInCustody(checkedOutAt: string): number {
  const out = new Date(checkedOutAt).getTime();
  return Math.max(0, Math.floor((Date.now() - out) / 86_400_000));
}
