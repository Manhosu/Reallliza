"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  ShieldCheck,
  Banknote,
  Hourglass,
  Percent,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface AccountRow {
  id: string;
  category: string;
  beneficiary_name?: string;
  payer_name?: string;
  description: string | null;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
}

interface InvoiceRow {
  id: string;
  numero: string;
  status: string;
  amount: number;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  nfe_status: string;
  nfe_pdf_url: string | null;
  service_order: {
    id: string;
    order_number: number | null;
    client_name: string;
  } | null;
}

interface FinAdminData {
  kpis: {
    revenue_month: number;
    in_custody: number;
    released: number;
    pending: number;
    platform_fees_total: number;
  };
  payable: AccountRow[];
  receivable: AccountRow[];
  invoices: InvoiceRow[];
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

type Tab = "kpis" | "payable" | "receivable" | "invoices";

export default function FinanceiroAdminPage() {
  const [data, setData] = useState<FinAdminData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("kpis");
  const [emitting, setEmitting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.get<FinAdminData>("/financeiro/admin");
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleEmitNfe(invoiceId: string) {
    setEmitting(invoiceId);
    try {
      await apiClient.post(`/invoices/${invoiceId}/emit`);
      toast.success("Emissão solicitada — aguardando autorização SEFAZ");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setEmitting(null);
    }
  }

  const kpiCards = [
    {
      label: "Receita do mês",
      value: data?.kpis.revenue_month ?? 0,
      icon: TrendingUp,
      accent: "border-t-green-500",
      bg: "bg-green-500/10 text-green-600 dark:text-green-400",
    },
    {
      label: "Em custódia",
      value: data?.kpis.in_custody ?? 0,
      icon: ShieldCheck,
      accent: "border-t-amber-500",
      bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      label: "Repassados",
      value: data?.kpis.released ?? 0,
      icon: Banknote,
      accent: "border-t-blue-500",
      bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      label: "A receber",
      value: data?.kpis.pending ?? 0,
      icon: Hourglass,
      accent: "border-t-purple-500",
      bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    },
    {
      label: "Taxa plataforma",
      value: data?.kpis.platform_fees_total ?? 0,
      icon: Percent,
      accent: "border-t-pink-500",
      bg: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
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
          Contas a pagar e receber, faturamento, NFe e fechamento mensal.
        </p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
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
              <p className="mt-2 text-base font-bold tracking-tight">
                {isLoading ? "..." : formatBRL(c.value)}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-secondary/50 p-1">
        {[
          { key: "kpis" as Tab, label: "Resumo", icon: Wallet },
          { key: "payable" as Tab, label: "Contas a Pagar", icon: ArrowUpFromLine },
          { key: "receivable" as Tab, label: "Contas a Receber", icon: ArrowDownToLine },
          { key: "invoices" as Tab, label: "Faturamento + NFe", icon: Receipt },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : !data ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Falha ao carregar dados financeiros.
          </CardContent>
        </Card>
      ) : tab === "kpis" ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Resumo do mês</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Margem líquida estimada
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {formatBRL(
                    (data.kpis.revenue_month ?? 0) - (data.kpis.released ?? 0)
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Receita − Repasses
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total em movimento
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {formatBRL(
                    (data.kpis.in_custody ?? 0) +
                      (data.kpis.released ?? 0) +
                      (data.kpis.pending ?? 0)
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Custódia + Repassados + A receber
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : tab === "payable" ? (
        <Card>
          <CardContent className="p-0">
            {data.payable.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma conta a pagar.
              </p>
            ) : (
              <div className="divide-y">
                {data.payable.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.beneficiary_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.description ?? r.category}
                        {r.due_date && ` · Venc.: ${formatDate(r.due_date)}`}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        r.status === "paid"
                          ? "bg-green-500/10 text-green-700 dark:text-green-300"
                          : r.status === "overdue"
                            ? "bg-red-500/10 text-red-700 dark:text-red-300"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {r.status}
                    </span>
                    <p className="text-sm font-bold">{formatBRL(r.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : tab === "receivable" ? (
        <Card>
          <CardContent className="p-0">
            {data.receivable.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma conta a receber.
              </p>
            ) : (
              <div className="divide-y">
                {data.receivable.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.payer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.description ?? r.category}
                        {r.due_date && ` · Venc.: ${formatDate(r.due_date)}`}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        r.status === "paid"
                          ? "bg-green-500/10 text-green-700 dark:text-green-300"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {r.status}
                    </span>
                    <p className="text-sm font-bold">{formatBRL(r.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {data.invoices.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma fatura emitida. Faturas são geradas quando uma OS é
                aprovada.
              </p>
            ) : (
              <div className="divide-y">
                {data.invoices.map((inv) => {
                  const nfeIssued = inv.nfe_status === "issued";
                  const nfeError = inv.nfe_status === "error";
                  return (
                    <div key={inv.id} className="flex flex-wrap items-center gap-3 p-4">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{inv.numero}</span>
                          {inv.service_order && (
                            <>
                              <span className="text-sm text-muted-foreground">·</span>
                              <span className="text-sm">
                                OS #{inv.service_order.order_number ?? "—"} —{" "}
                                {inv.service_order.client_name}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Emitida: {formatDate(inv.issued_at)}
                          {inv.due_at && ` · Venc.: ${formatDate(inv.due_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                            nfeIssued
                              ? "bg-green-500/10 text-green-700 dark:text-green-300"
                              : nfeError
                                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                                : inv.nfe_status === "processing"
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          )}
                        >
                          {nfeIssued && <CheckCircle2 className="h-3 w-3" />}
                          {nfeError && <XCircle className="h-3 w-3" />}
                          NFe: {inv.nfe_status}
                        </span>
                        {inv.nfe_pdf_url && (
                          <a
                            href={inv.nfe_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-xs hover:bg-muted"
                          >
                            <Download className="h-3 w-3" />
                            PDF
                          </a>
                        )}
                        {!nfeIssued && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEmitNfe(inv.id)}
                            isLoading={emitting === inv.id}
                            disabled={!!emitting}
                          >
                            Emitir NFe
                          </Button>
                        )}
                      </div>
                      <p className="text-sm font-bold">{formatBRL(inv.amount)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
