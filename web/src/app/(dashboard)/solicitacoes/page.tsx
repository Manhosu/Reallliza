"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarClock,
  Banknote,
  Hourglass,
  ShieldCheck,
  Building2,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { quotesApi } from "@/lib/api";
import type { Quote } from "@/lib/api/quotes";
import { cn } from "@/lib/utils";

type FilterKey =
  | "all"
  | "aguardando_pagamento"
  | "aguardando_aceite"
  | "agendada"
  | "em_execucao"
  | "concluida"
  | "cancelada";

// Derivacao do status visual da loja a partir de quote.status + modality + OS
function deriveFilterKey(q: Quote & { service_order_status?: string | null }): FilterKey {
  if (q.status === "cancelled") return "cancelada";
  if (q.status === "draft" || q.status === "awaiting_payment")
    return "aguardando_pagamento";
  // converted/paid → ja tem OS
  if (q.modality === "homologados" && q.service_order_id && !q.service_order_status) {
    return "aguardando_aceite";
  }
  const osStatus = q.service_order_status;
  if (osStatus === "completed" || osStatus === "approved" || osStatus === "invoiced") {
    return "concluida";
  }
  if (osStatus === "in_progress" || osStatus === "paused") return "em_execucao";
  if (osStatus === "assigned" || osStatus === "pending") return "agendada";
  return "agendada";
}

const FILTERS: Array<{
  key: FilterKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  { key: "all", label: "Todas", icon: Filter, color: "text-foreground" },
  {
    key: "aguardando_pagamento",
    label: "Aguardando pagamento",
    icon: Banknote,
    color: "text-amber-500",
  },
  {
    key: "aguardando_aceite",
    label: "Aguardando aceite",
    icon: Hourglass,
    color: "text-blue-500",
  },
  {
    key: "agendada",
    label: "Agendada",
    icon: CalendarClock,
    color: "text-purple-500",
  },
  {
    key: "em_execucao",
    label: "Em execução",
    icon: Clock,
    color: "text-blue-600",
  },
  {
    key: "concluida",
    label: "Concluída",
    icon: CheckCircle2,
    color: "text-green-500",
  },
  {
    key: "cancelada",
    label: "Cancelada",
    icon: XCircle,
    color: "text-zinc-500",
  },
];

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface QuoteWithOs extends Quote {
  service_order_status?: string | null;
  service_order?: { status: string } | null;
}

export default function SolicitacoesPage() {
  const [quotes, setQuotes] = useState<QuoteWithOs[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = (await quotesApi.list()) as QuoteWithOs[];
      // Normaliza service_order_status quando vier no payload
      setQuotes(
        data.map((q) => ({
          ...q,
          service_order_status:
            q.service_order_status ?? q.service_order?.status ?? null,
        }))
      );
    } catch (err) {
      console.error("Failed to load quotes:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const acc: Record<FilterKey, number> = {
      all: quotes.length,
      aguardando_pagamento: 0,
      aguardando_aceite: 0,
      agendada: 0,
      em_execucao: 0,
      concluida: 0,
      cancelada: 0,
    };
    for (const q of quotes) acc[deriveFilterKey(q)]++;
    return acc;
  }, [quotes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes
      .filter((q) => activeFilter === "all" || deriveFilterKey(q) === activeFilter)
      .filter(
        (q) =>
          !term ||
          q.client_name?.toLowerCase().includes(term) ||
          String(q.quote_number).includes(term)
      )
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [quotes, activeFilter, search]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Solicitações
          </h1>
          <p className="text-muted-foreground">
            Todas as suas solicitações com filtros por status.
          </p>
        </div>
        <Link
          href="/orcamentos/novo"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Nova Solicitação
        </Link>
      </motion.div>

      {/* Filter chips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const active = activeFilter === f.key;
          const count = counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", f.color)} />
              {f.label}
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                {count}
              </span>
            </button>
          );
        })}
      </motion.div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por número ou cliente..."
          className="pl-9"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={
            quotes.length === 0
              ? "Nenhuma solicitação ainda"
              : "Nenhum resultado para esse filtro"
          }
          description={
            quotes.length === 0
              ? "Crie sua primeira solicitação para começar."
              : "Tente outro filtro ou limpe a busca."
          }
        />
      ) : (
        <motion.ol className="space-y-2">
          {filtered.map((q) => {
            const fkey = deriveFilterKey(q);
            const filter = FILTERS.find((f) => f.key === fkey)!;
            const FilterIcon = filter.icon;
            return (
              <motion.li
                key={q.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Link
                  href={`/orcamentos/${q.id}`}
                  className="block transition hover:translate-y-[-1px]"
                >
                  <Card>
                    <CardContent className="flex flex-wrap items-start gap-3 p-4">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted",
                          filter.color
                        )}
                      >
                        <FilterIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            #{q.quote_number}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ·
                          </span>
                          <span className="truncate text-sm font-medium">
                            {q.client_name}
                          </span>
                          {q.modality === "reallliza" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              <Building2 className="h-3 w-3" />
                              Reallliza
                            </span>
                          ) : q.modality === "homologados" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                              <Users className="h-3 w-3" />
                              Homologados
                            </span>
                          ) : null}
                          {q.custody_held && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              <ShieldCheck className="h-3 w-3" />
                              Em custódia
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{filter.label}</span>
                          <span>·</span>
                          <span>{formatDate(q.created_at)}</span>
                          {q.service_date && (
                            <>
                              <span>·</span>
                              <span>Execução: {formatDate(q.service_date)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatBRL(q.total_amount)}
                        </p>
                        {(q.items?.length ?? 0) > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            {q.items?.length} item(ns)
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.li>
            );
          })}
        </motion.ol>
      )}
    </div>
  );
}
