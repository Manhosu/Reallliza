"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  Star,
  ShieldAlert,
  Wrench,
  Award,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as PieChartComponent,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface BiData {
  range: { from: string; to: string };
  os_by_status: Record<string, number>;
  total_os: number;
  revenue_by_month: Array<{ month: string; revenue: number }>;
  top_services: Array<{
    service_id: string;
    name: string;
    count: number;
    total: number;
  }>;
  top_technicians: Array<{
    technician_id: string;
    name: string;
    completed_count: number;
    total_count: number;
    overall_score: number | null;
  }>;
  total_warranties: number;
  warranty_rate: number;
  avg_rating: number;
  total_ratings: number;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  assigned: "Atribuída",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  approved: "Aprovada",
  invoiced: "Faturada",
  cancelled: "Cancelada",
  rejected: "Rejeitada",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#94A3B8",
  pending: "#F59E0B",
  assigned: "#A855F7",
  in_progress: "#3B82F6",
  paused: "#FB7185",
  completed: "#22C55E",
  approved: "#10B981",
  invoiced: "#06B6D4",
  cancelled: "#71717A",
  rejected: "#EF4444",
};

export default function BiPage() {
  const [data, setData] = useState<BiData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.get<BiData>("/bi");
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

  const pieData = data
    ? Object.entries(data.os_by_status).map(([status, value]) => ({
        name: STATUS_LABELS[status] ?? status,
        value,
        color: STATUS_COLORS[status] ?? "#94A3B8",
      }))
    : [];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          BI / Dashboards Gerenciais
        </h1>
        <p className="text-muted-foreground">
          KPIs e análises dos últimos 12 meses para tomada de decisão.
        </p>
      </motion.div>

      {/* Header KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Total OS"
          value={String(data?.total_os ?? 0)}
          icon={Wrench}
          accent="border-t-blue-500"
          bg="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="Garantias"
          value={String(data?.total_warranties ?? 0)}
          hint={`${data?.warranty_rate ?? 0}% das OS`}
          icon={ShieldAlert}
          accent={cn(
            "border-t-2",
            (data?.warranty_rate ?? 0) > 10
              ? "border-t-red-500"
              : "border-t-green-500"
          )}
          bg="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="Avaliação média"
          value={data?.avg_rating ? `${data.avg_rating} ⭐` : "—"}
          hint={`${data?.total_ratings ?? 0} avaliações`}
          icon={Star}
          accent="border-t-yellow-500"
          bg="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="Receita 12 meses"
          value={formatBRL(
            data?.revenue_by_month.reduce((s, m) => s + m.revenue, 0) ?? 0
          )}
          icon={TrendingUp}
          accent="border-t-green-500"
          bg="bg-green-500/10 text-green-600 dark:text-green-400"
          isLoading={isLoading}
        />
      </div>

      {/* Revenue por mes (Area) */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Receita por Mês (R$)</h2>
          </div>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data?.revenue_by_month ?? []}>
                <defs>
                  <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EAB308" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#EAB308" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis
                  className="text-xs"
                  tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                />
                <ChartTooltip
                  formatter={(v) => formatBRL(Number(v) || 0)}
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#EAB308"
                  fill="url(#revArea)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* OS por status (Pie) + Top servicos + Top tecnicos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold">OS por Status</h2>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : pieData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Sem dados
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChartComponent>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip />
                </PieChartComponent>
              </ResponsiveContainer>
            )}
            <div className="mt-2 space-y-1">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <div className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  <span className="flex-1 text-muted-foreground">{d.name}</span>
                  <span className="font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Top 5 Serviços</h2>
            </div>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !data || data.top_services.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Sem dados
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data.top_services.map((s) => ({
                    name: s.name.slice(0, 18),
                    total: s.total,
                  }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    className="text-xs"
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis dataKey="name" type="category" className="text-xs" width={130} />
                  <ChartTooltip formatter={(v) => formatBRL(Number(v) || 0)} />
                  <Bar dataKey="total" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Top 5 Técnicos</h2>
            </div>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !data || data.top_technicians.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Sem dados
              </p>
            ) : (
              <div className="space-y-2">
                {data.top_technicians.map((t, i) => (
                  <div
                    key={t.technician_id}
                    className="flex items-center gap-2 rounded-lg border bg-card p-2"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.completed_count}/{t.total_count} concluídas
                      </p>
                    </div>
                    {t.overall_score != null && (
                      <span className="text-xs font-medium">
                        ⭐ {t.overall_score.toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  bg,
  isLoading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  bg: string;
  isLoading: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-t-2 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5",
        accent
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className={cn("rounded-lg p-1.5", bg)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-base font-bold tracking-tight">
        {isLoading ? "..." : value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
