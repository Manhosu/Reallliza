"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wallet,
  ShieldCheck,
  Banknote,
  Hourglass,
  CheckCircle2,
  ExternalLink,
  CreditCard,
  Receipt,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Payment {
  id: string;
  quote_id: string | null;
  amount: number;
  status: string;
  custody_status: string;
  method: string | null;
  paid_at: string | null;
  released_at: string | null;
  checkout_url: string | null;
  platform_fee_amount: number | null;
  payout_amount: number | null;
  created_at: string;
  quote?: {
    id: string;
    quote_number: number;
    client_name: string;
    modality: string | null;
  } | null;
}

interface FinanceData {
  kpis: {
    paid_this_month: number;
    in_custody: number;
    released: number;
    pending: number;
  };
  payments: Payment[];
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

const CUSTODY_LABELS: Record<string, { label: string; cls: string }> = {
  not_applicable: { label: "—", cls: "text-muted-foreground" },
  held: {
    label: "Em custódia",
    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  released: {
    label: "Liberado",
    cls: "bg-green-500/10 text-green-700 dark:text-green-300",
  },
  refunded: {
    label: "Estornado",
    cls: "bg-zinc-500/10 text-zinc-500",
  },
};

export default function FinanceiroLojaPage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.get<FinanceData>("/financeiro/loja");
      setData(result);
    } catch (err) {
      console.error("Failed to load financial data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpiCards = [
    {
      label: "Pago no mês",
      value: data?.kpis.paid_this_month ?? 0,
      icon: CheckCircle2,
      accent: "border-t-green-500",
      bg: "bg-green-500/10 text-green-600 dark:text-green-400",
      hint: "valor confirmado este mês",
    },
    {
      label: "Em custódia",
      value: data?.kpis.in_custody ?? 0,
      icon: ShieldCheck,
      accent: "border-t-amber-500",
      bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      hint: "homologados aguardando conclusão",
    },
    {
      label: "Liberados",
      value: data?.kpis.released ?? 0,
      icon: Banknote,
      accent: "border-t-blue-500",
      bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      hint: "repasses já efetuados",
    },
    {
      label: "Pendentes",
      value: data?.kpis.pending ?? 0,
      icon: Hourglass,
      accent: "border-t-zinc-500",
      bg: "bg-muted text-muted-foreground",
      hint: "orçamentos aguardando pagamento",
    },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Financeiro
        </h1>
        <p className="text-muted-foreground">
          Pagamentos, custódia, repasses e comprovantes.
        </p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiCards.map((c) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "rounded-xl border-t-2 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5",
                c.accent
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
                <div className={cn("rounded-lg p-1.5", c.bg)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight">
                {isLoading ? "..." : formatBRL(c.value)}
              </p>
              <p className="text-xs text-muted-foreground">{c.hint}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Lista de pagamentos */}
      <div className="space-y-2">
        <h2 className="font-semibold">Pagamentos</h2>
        {isLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : !data || data.payments.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-8 w-8" />}
            title="Nenhum pagamento registrado"
            description="Quando você gerar um orçamento e ele for pago, os pagamentos aparecem aqui."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {data.payments.map((p) => {
                  const custody = CUSTODY_LABELS[p.custody_status] ?? CUSTODY_LABELS.not_applicable;
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {p.method === "pix" ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <Receipt className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.quote && (
                            <Link
                              href={`/orcamentos/${p.quote.id}`}
                              className="text-sm font-semibold hover:underline"
                            >
                              #{p.quote.quote_number}
                            </Link>
                          )}
                          <span className="text-sm text-muted-foreground">·</span>
                          <span className="truncate text-sm">
                            {p.quote?.client_name ?? "—"}
                          </span>
                          {p.quote?.modality === "homologados" && (
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                              Homologados
                            </span>
                          )}
                          {p.custody_status !== "not_applicable" && (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                custody.cls
                              )}
                            >
                              {custody.label}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{p.method?.toUpperCase() ?? "—"}</span>
                          <span>·</span>
                          <span>Pago em {formatDateTime(p.paid_at)}</span>
                          {p.released_at && (
                            <>
                              <span>·</span>
                              <span>Liberado em {formatDateTime(p.released_at)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatBRL(p.amount)}</p>
                        {p.payout_amount && p.payout_amount > 0 && p.payout_amount !== p.amount && (
                          <p className="text-[11px] text-muted-foreground">
                            Repasse {formatBRL(p.payout_amount)}
                          </p>
                        )}
                      </div>
                      {p.checkout_url && p.status !== "confirmed" && (
                        <a
                          href={p.checkout_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Pagar
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
