"use client";

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "@/lib/api/client";
import { ChevronDown, ChevronUp, Clock, Pause, Play, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Relatório de execução de uma OS — timeline com etapas, pausas e KPIs.
 * Jessica 18/06: precisava ver quando o técnico iniciou, quantas vezes
 * pausou, tempo total e tempo efetivo de cada etapa. Lê o endpoint
 * GET /api/service-orders/:id/steps/report.
 *
 * Imprimir vira PDF razoável via window.print() + @media print no globals.
 */

interface PauseEntry {
  paused_at: string;
  resumed_at: string;
  duration_seconds: number;
  reason?: string;
}

interface ReportStep {
  id: string;
  step_key: string;
  order_index: number;
  name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  total_duration_seconds: number | null;
  active_duration_seconds: number | null;
  total_pause_seconds: number;
  pause_count: number;
  wait_time_minutes: number;
  unlocked_at: string | null;
  pause_log: PauseEntry[];
  photos_count: number;
  notes: string | null;
}

interface Report {
  os: {
    id: string;
    order_number: number | null;
    title: string;
    status: string;
    technician_name: string | null;
  };
  steps: ReportStep[];
  summary: {
    started_at: string | null;
    completed_at: string | null;
    total_duration_seconds: number;
    total_active_seconds: number;
    total_pause_seconds: number;
    total_pauses: number;
  };
}

function fmtDuration(sec: number | null): string {
  if (sec == null || sec < 0) return "—";
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}min`);
  if (!h && s) parts.push(`${s}s`);
  return parts.length ? parts.join(" ") : `${m}min`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  osId: string;
  /** Liga/desliga toda a seção (ex: esconder em status draft). */
  enabled?: boolean;
}

export function ExecutionReportSection({ osId, enabled = true }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !expanded || report) return;
    let cancelled = false;
    setIsLoading(true);
    apiClient
      .get<Report>(`/service-orders/${osId}/steps/report`)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        /* ignore — seção fica vazia */
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [osId, enabled, expanded, report]);

  const hasAnyStep = useMemo(
    () => !!report?.steps?.length,
    [report?.steps]
  );

  if (!enabled) return null;

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Relatório de execução</h3>
            <p className="text-xs text-muted-foreground">
              Quando cada etapa iniciou, pausou e concluiu — com tempo total e efetivo.
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-4 print:block">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Carregando relatório...</p>
          )}

          {!isLoading && !hasAnyStep && (
            <p className="text-sm text-muted-foreground">
              Nenhuma etapa registrada nesta OS ainda.
            </p>
          )}

          {report && hasAnyStep && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard
                  label="Tempo total"
                  value={fmtDuration(report.summary.total_duration_seconds)}
                  hint="início → conclusão"
                />
                <KpiCard
                  label="Tempo efetivo"
                  value={fmtDuration(report.summary.total_active_seconds)}
                  hint="excluindo pausas"
                  highlight
                />
                <KpiCard
                  label="Tempo pausado"
                  value={fmtDuration(report.summary.total_pause_seconds)}
                  hint={`${report.summary.total_pauses} pausa${
                    report.summary.total_pauses === 1 ? "" : "s"
                  }`}
                />
                <KpiCard
                  label="Período"
                  value={
                    report.summary.started_at
                      ? `${fmtDateTime(report.summary.started_at).split(",")[0]}`
                      : "—"
                  }
                  hint={
                    report.summary.completed_at
                      ? `até ${fmtDateTime(report.summary.completed_at)
                          .split(",")[0]
                          .trim()}`
                      : "em andamento"
                  }
                />
              </div>

              {/* Botão imprimir/PDF */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-xs text-muted-foreground hover:text-foreground underline print:hidden"
                >
                  Imprimir / salvar PDF
                </button>
              </div>

              {/* Lista de etapas */}
              <ol className="space-y-2">
                {report.steps.map((s) => {
                  const isExp = expandedSteps.has(s.id);
                  return (
                    <li key={s.id} className="rounded-lg border bg-background">
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 p-3 text-left"
                        onClick={() => {
                          setExpandedSteps((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          });
                        }}
                      >
                        <span
                          className={cn(
                            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            s.status === "completed"
                              ? "bg-green-500/15 text-green-600 dark:text-green-400"
                              : s.status === "in_progress"
                                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                : s.status === "skipped"
                                  ? "bg-zinc-500/15 text-zinc-500"
                                  : "bg-muted text-muted-foreground"
                          )}
                        >
                          {s.order_index + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{s.name}</span>
                            <StatusBadge status={s.status} pausedAt={s.paused_at} />
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmtDateTime(s.started_at)} → {fmtDateTime(s.completed_at)}
                            </span>
                            <span>
                              <strong className="text-foreground">
                                {fmtDuration(s.active_duration_seconds)}
                              </strong>{" "}
                              efetivo
                            </span>
                            {s.pause_count > 0 && (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <Pause className="h-3 w-3" />
                                {s.pause_count}× pausada ({fmtDuration(s.total_pause_seconds)})
                              </span>
                            )}
                            {s.wait_time_minutes > 0 && (
                              <span>cura de {s.wait_time_minutes} min</span>
                            )}
                            {s.photos_count > 0 && (
                              <span>{s.photos_count} fotos</span>
                            )}
                          </div>
                        </div>
                        {(s.pause_log.length > 0 || s.notes) && (
                          isExp ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )
                        )}
                      </button>

                      {isExp && (s.pause_log.length > 0 || s.notes) && (
                        <div className="border-t bg-muted/30 px-3 py-2 space-y-2">
                          {s.notes && (
                            <p className="text-xs">
                              <span className="font-medium">Observações:</span> {s.notes}
                            </p>
                          )}
                          {s.pause_log.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Pausas registradas
                              </p>
                              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                                {s.pause_log.map((p, i) => (
                                  <li key={i}>
                                    <Play className="inline h-3 w-3 mr-1" />
                                    {fmtDateTime(p.paused_at)} → {fmtDateTime(p.resumed_at)}{" "}
                                    <span className="font-medium text-foreground">
                                      ({fmtDuration(p.duration_seconds)})
                                    </span>
                                    {p.reason ? ` — ${p.reason}` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background"
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatusBadge({
  status,
  pausedAt,
}: {
  status: string;
  pausedAt: string | null;
}) {
  if (pausedAt) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-300">
        Pausada
      </span>
    );
  }
  const map: Record<string, { label: string; cls: string }> = {
    completed: {
      label: "Concluída",
      cls: "bg-green-500/15 text-green-700 dark:text-green-300",
    },
    in_progress: {
      label: "Em andamento",
      cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    },
    skipped: { label: "Pulada", cls: "bg-zinc-500/15 text-zinc-500" },
    pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status] ?? map.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
        m.cls
      )}
    >
      {m.label}
    </span>
  );
}
