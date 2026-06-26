"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  X,
  Clock,
  Wrench,
  Package,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "pending" | "approved" | "rejected" | "released";

interface ToolRequest {
  id: string;
  tool_name: string;
  quantity: number;
  justification: string | null;
  priority: Priority;
  status: Status;
  rejection_reason: string | null;
  created_at: string;
  requester: { id: string; full_name: string; role: string } | null;
}

const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; bg: string; border: string; rank: number }
> = {
  urgent: {
    label: "Urgente",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    rank: 0,
  },
  high: {
    label: "Alta",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/40",
    rank: 1,
  },
  medium: {
    label: "Média",
    color: "text-yellow-600 dark:text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/40",
    rank: 2,
  },
  low: {
    label: "Baixa",
    color: "text-zinc-600 dark:text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/40",
    rank: 3,
  },
};

const STATUS_META: Record<Status, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "text-amber-600 dark:text-amber-400" },
  approved: { label: "Aprovado", color: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejeitado", color: "text-red-600 dark:text-red-400" },
  released: { label: "Entregue", color: "text-blue-600 dark:text-blue-400" },
};

export default function ToolRequestsPage() {
  const [requests, setRequests] = useState<ToolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<{ requests: ToolRequest[] }>(
        `/tools/requests?status=${statusFilter}`
      );
      setRequests(data.requests ?? []);
    } catch (err) {
      console.error("load tool_requests", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject", reason?: string) {
    setActing(id);
    try {
      await apiClient.patch(`/tools/requests/${id}`, {
        action,
        rejection_reason: reason,
      });
      await load();
      setRejectModal(null);
      setRejectReason("");
    } catch (err) {
      console.error("decide tool_request", err);
      alert(err instanceof Error ? err.message : "Erro ao decidir");
    } finally {
      setActing(null);
    }
  }

  // Ordenacao client-side adicional (defensivo): urgent → high → medium → low,
  // depois mais antigos primeiro. O endpoint ja faz isso, mas se for chamado
  // sem o ORDER BY (cache stale, RLS etc) garantimos a fila correta.
  const sorted = [...requests].sort((a, b) => {
    const ra = PRIORITY_META[a.priority]?.rank ?? 9;
    const rb = PRIORITY_META[b.priority]?.rank ?? 9;
    if (ra !== rb) return ra - rb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/ferramentas"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Almoxarifado
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Solicitações de Ferramentas
          </h1>
          <p className="text-sm text-muted-foreground">
            Fila ordenada por prioridade. Urgentes pulam na frente automaticamente.
          </p>
        </div>
      </div>

      {/* Filtros de status */}
      <div className="flex flex-wrap gap-2 rounded-xl bg-secondary/50 p-1">
        {(["pending", "approved", "rejected", "released", "all"] as const).map(
          (s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                statusFilter === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "all" ? "Todos" : STATUS_META[s].label}
            </button>
          )
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12 text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-sm text-muted-foreground">
          <Package className="h-8 w-8 opacity-40" />
          Nenhuma solicitação{" "}
          {statusFilter !== "all" ? STATUS_META[statusFilter].label.toLowerCase() : ""}.
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {sorted.map((r) => {
              const p = PRIORITY_META[r.priority];
              const s = STATUS_META[r.status];
              const isPending = r.status === "pending";
              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-4 transition md:flex-row md:items-center md:justify-between",
                    p.border,
                    r.priority === "urgent" && "ring-2 ring-red-500/30",
                    r.priority === "urgent" ? p.bg : "bg-card"
                  )}
                >
                  <div className="flex flex-1 items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        p.bg
                      )}
                    >
                      {r.priority === "urgent" ? (
                        <AlertTriangle className={cn("h-5 w-5", p.color)} />
                      ) : (
                        <Wrench className={cn("h-5 w-5", p.color)} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold leading-tight">
                          {r.quantity}× {r.tool_name}
                        </p>
                        <span
                          className={cn(
                            "rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            p.color,
                            p.border,
                            p.bg
                          )}
                        >
                          {p.label}
                        </span>
                        <span className={cn("text-xs font-medium", s.color)}>
                          {s.label}
                        </span>
                      </div>
                      {r.justification && (
                        <p className="text-xs text-muted-foreground">
                          “{r.justification}”
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        <Clock className="inline h-3 w-3 mr-1" />
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                        {r.requester?.full_name && (
                          <> · pedido por <strong>{r.requester.full_name}</strong></>
                        )}
                      </p>
                      {r.rejection_reason && (
                        <p className="text-xs text-red-500">
                          Recusado: {r.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => decide(r.id, "approve")}
                        disabled={acting === r.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                      >
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </button>
                      <button
                        onClick={() => setRejectModal({ id: r.id, name: r.tool_name })}
                        disabled={acting === r.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" /> Rejeitar
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modal de motivo da rejeicao */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              Rejeitar “{rejectModal.name}”?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O técnico verá o motivo abaixo.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex.: ferramenta em manutenção, aguardar segunda-feira…"
              className="mt-3 w-full rounded-lg border bg-background p-2 text-sm"
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason("");
                }}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  decide(rejectModal.id, "reject", rejectReason || undefined)
                }
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
              >
                Confirmar rejeição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
