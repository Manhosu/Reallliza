"use client";

import { cn } from "@/lib/utils";
import {
  UNIT_STATUS_LABELS,
  DEADLINE_LABELS,
  MAINTENANCE_STATUS_LABELS,
  deadlineSituation,
  type DeadlineSituation,
  type MaintenanceStatus,
} from "@/lib/tools/types";

type Tone = { bg: string; text: string; dot: string };

const NEUTRAL: Tone = {
  bg: "bg-zinc-500/10",
  text: "text-zinc-400",
  dot: "bg-zinc-400",
};

const UNIT_TONES: Record<string, Tone> = {
  available: { bg: "bg-green-500/10", text: "text-green-500", dot: "bg-green-500" },
  reserved: { bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  in_custody: { bg: "bg-blue-500/10", text: "text-blue-500", dot: "bg-blue-500" },
  maintenance: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
  damaged: { bg: "bg-red-500/10", text: "text-red-500", dot: "bg-red-500" },
  awaiting_evaluation: { bg: "bg-orange-500/10", text: "text-orange-500", dot: "bg-orange-500" },
  missing: { bg: "bg-pink-500/10", text: "text-pink-400", dot: "bg-pink-400" },
  retired: NEUTRAL,
};

/** Situação de uma unidade física (spec seção 9). */
export function UnitStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = UNIT_TONES[status] ?? NEUTRAL;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        tone.bg,
        tone.text,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {UNIT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

const DEADLINE_TONES: Record<DeadlineSituation, Tone> = {
  on_time: { bg: "bg-green-500/10", text: "text-green-500", dot: "bg-green-500" },
  due_today: { bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  overdue: { bg: "bg-red-500/10", text: "text-red-500", dot: "bg-red-500" },
  return_requested: { bg: "bg-blue-500/10", text: "text-blue-500", dot: "bg-blue-500" },
  extension_pending: { bg: "bg-orange-500/10", text: "text-orange-500", dot: "bg-orange-500" },
  no_deadline: NEUTRAL,
};

/**
 * Situação do prazo de uma custódia — as cores que a spec define nas
 * seções 4 e 6 (verde no prazo, amarelo vence hoje, vermelho atrasada,
 * azul devolução solicitada, laranja prorrogação pendente).
 */
export function DeadlineBadge({
  custody,
  className,
}: {
  custody: {
    expected_return_at?: string | null;
    checked_in_at?: string | null;
    return_requested_at?: string | null;
    has_pending_extension?: boolean;
  };
  className?: string;
}) {
  const situation = deadlineSituation(custody);
  const tone = DEADLINE_TONES[situation];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        tone.bg,
        tone.text,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {DEADLINE_LABELS[situation]}
    </span>
  );
}

const MAINTENANCE_TONES: Record<string, Tone> = {
  awaiting_evaluation: { bg: "bg-orange-500/10", text: "text-orange-500", dot: "bg-orange-500" },
  diagnosing: { bg: "bg-blue-500/10", text: "text-blue-500", dot: "bg-blue-500" },
  awaiting_approval: { bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  repairing: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
  awaiting_part: { bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  testing: { bg: "bg-cyan-500/10", text: "text-cyan-500", dot: "bg-cyan-500" },
  completed: { bg: "bg-green-500/10", text: "text-green-500", dot: "bg-green-500" },
  unrepairable: { bg: "bg-red-500/10", text: "text-red-500", dot: "bg-red-500" },
  sent_to_retirement: NEUTRAL,
};

export function MaintenanceStatusBadge({ status }: { status: string }) {
  const tone = MAINTENANCE_TONES[status] ?? NEUTRAL;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        tone.bg,
        tone.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {MAINTENANCE_STATUS_LABELS[status as MaintenanceStatus] ?? status}
    </span>
  );
}

/** Situação de um pedido, no vocabulário completo dos 8 status. */
const REQUEST_LABELS: Record<string, string> = {
  pending: "Em análise",
  approved: "Aprovado",
  separating: "Separado",
  awaiting_pickup: "Pronto para retirada",
  delivered: "Entregue",
  released: "Liberado",
  rejected: "Recusado",
  cancelled: "Cancelado",
};

const REQUEST_TONES: Record<string, Tone> = {
  pending: { bg: "bg-blue-500/10", text: "text-blue-500", dot: "bg-blue-500" },
  approved: { bg: "bg-green-500/10", text: "text-green-500", dot: "bg-green-500" },
  separating: { bg: "bg-amber-500/10", text: "text-amber-500", dot: "bg-amber-500" },
  awaiting_pickup: { bg: "bg-cyan-500/10", text: "text-cyan-500", dot: "bg-cyan-500" },
  delivered: { bg: "bg-green-500/10", text: "text-green-500", dot: "bg-green-500" },
  released: { bg: "bg-green-500/10", text: "text-green-500", dot: "bg-green-500" },
  rejected: { bg: "bg-red-500/10", text: "text-red-500", dot: "bg-red-500" },
  cancelled: NEUTRAL,
};

export function RequestStatusBadge({ status }: { status: string }) {
  const tone = REQUEST_TONES[status] ?? NEUTRAL;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        tone.bg,
        tone.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {REQUEST_LABELS[status] ?? status}
    </span>
  );
}

export { REQUEST_LABELS };
