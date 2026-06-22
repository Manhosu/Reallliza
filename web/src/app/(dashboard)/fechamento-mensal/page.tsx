"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  Unlock,
  Calendar,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Closing {
  id: string;
  year: number;
  month: number;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  summary: {
    total_received?: number;
    total_paid_out?: number;
    total_in_custody?: number;
    total_platform_fees?: number;
    net_revenue?: number;
    count_quotes?: number;
    count_os?: number;
    count_warranties?: number;
  };
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function FechamentoMensalPage() {
  const [closings, setClosings] = useState<Closing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const now = new Date();
  const [selYear, setSelYear] = useState(String(now.getFullYear()));
  const prevMonth = now.getMonth(); // 0-based, so mes anterior é now.getMonth()
  const [selMonth, setSelMonth] = useState(String(prevMonth || 12));

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<Closing[]>("/monthly-closing");
      setClosings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClose() {
    if (
      !confirm(
        `Fechar ${MONTH_NAMES[parseInt(selMonth, 10) - 1]}/${selYear}? Após o fechamento, edições retroativas ficam bloqueadas.`
      )
    ) {
      return;
    }
    setClosing(true);
    try {
      await apiClient.post("/monthly-closing", {
        year: Number(selYear),
        month: Number(selMonth),
      });
      toast.success(`${MONTH_NAMES[parseInt(selMonth, 10) - 1]}/${selYear} fechado`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setClosing(false);
    }
  }

  async function handleReopen(year: number, month: number) {
    if (!confirm(`Reabrir ${MONTH_NAMES[month - 1]}/${year}? Edições retroativas voltam a ser permitidas.`)) return;
    try {
      await apiClient.delete(`/monthly-closing?year=${year}&month=${month}`);
      toast.success("Mês reaberto");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Fechamento Mensal
        </h1>
        <p className="text-muted-foreground">
          Consolida receita, repasses, custódia e KPIs do mês. Após fechado,
          serve de baseline para auditoria.
        </p>
      </motion.div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Fechar novo mês</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Mês</label>
              <SelectNative
                value={selMonth}
                onChange={(e) => setSelMonth(e.target.value)}
                className="w-44"
              >
                {MONTH_NAMES.map((n, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {n}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Input
                type="number"
                min="2020"
                max="2099"
                value={selYear}
                onChange={(e) => setSelYear(e.target.value)}
                className="w-28"
              />
            </div>
            <Button onClick={handleClose} isLoading={closing}>
              <Lock className="h-4 w-4" />
              Fechar mês
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de fechamentos */}
      <div className="space-y-2">
        <h2 className="font-semibold">Histórico de fechamentos</h2>
        {isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : closings.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhum mês fechado ainda.
            </CardContent>
          </Card>
        ) : (
          closings.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl",
                        c.status === "closed"
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {c.status === "closed" ? (
                        <Lock className="h-5 w-5" />
                      ) : (
                        <Calendar className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">
                        {MONTH_NAMES[c.month - 1]} / {c.year}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {c.status === "closed"
                          ? `Fechado em ${new Date(c.closed_at!).toLocaleDateString("pt-BR")}`
                          : "Aberto"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        c.status === "closed"
                          ? "bg-green-500/10 text-green-700 dark:text-green-300"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {c.status === "closed" ? "Fechado" : "Aberto"}
                    </span>
                    {c.status === "closed" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleReopen(c.year, c.month)}
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        Reabrir
                      </Button>
                    )}
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 md:grid-cols-4">
                    <KpiSmall
                      label="Receita"
                      value={formatBRL(c.summary.total_received ?? 0)}
                    />
                    <KpiSmall
                      label="Repasses"
                      value={formatBRL(c.summary.total_paid_out ?? 0)}
                    />
                    <KpiSmall
                      label="Em custódia"
                      value={formatBRL(c.summary.total_in_custody ?? 0)}
                    />
                    <KpiSmall
                      label="Líquido"
                      value={formatBRL(c.summary.net_revenue ?? 0)}
                      highlight
                    />
                    <KpiSmall
                      label="Orçamentos"
                      value={String(c.summary.count_quotes ?? 0)}
                    />
                    <KpiSmall
                      label="OS"
                      value={String(c.summary.count_os ?? 0)}
                    />
                    <KpiSmall
                      label="Garantias"
                      value={String(c.summary.count_warranties ?? 0)}
                    />
                    <KpiSmall
                      label="Taxa plataforma"
                      value={formatBRL(c.summary.total_platform_fees ?? 0)}
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function KpiSmall({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold",
          highlight && "text-primary"
        )}
      >
        {value}
      </p>
    </div>
  );
}
