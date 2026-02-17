"use client";

import { motion } from "framer-motion";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  CalendarDays,
  Activity,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth-store";
import { dashboardApi } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import type { DashboardStats, OsPerMonth } from "@/lib/api";
import { UserRole } from "@/lib/types";
import type { OsStatusHistory, Schedule } from "@/lib/types";

// ============================================================
// Helpers
// ============================================================

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "Agora";
  if (diffMinutes < 60) return `Ha ${diffMinutes} minuto${diffMinutes !== 1 ? "s" : ""}`;
  if (diffHours < 24) return `Ha ${diffHours} hora${diffHours !== 1 ? "s" : ""}`;
  return `Ha ${diffDays} dia${diffDays !== 1 ? "s" : ""}`;
}

function formatScheduleDate(dateStr: string, timeStr: string | null): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeDisplay = timeStr ? `, ${timeStr.slice(0, 5)}` : "";

  if (isToday) return `Hoje${timeDisplay}`;
  if (isTomorrow) return `Amanha${timeDisplay}`;
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}${timeDisplay}`;
}

// ============================================================
// Metric Card Component
// ============================================================

interface MetricCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "up" | "down" | "neutral";
  icon: React.ReactNode;
  accentColor: string;
  delay: number;
}

function MetricCard({
  title,
  value,
  change,
  changeType,
  icon,
  accentColor,
  delay,
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
    >
      <Card hover className="relative overflow-hidden">
        {/* Top accent line */}
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: accentColor }}
        />
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                {title}
              </p>
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              <div className="flex items-center gap-1">
                {changeType === "up" && (
                  <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />
                )}
                <span
                  className={`text-xs font-medium ${
                    changeType === "up"
                      ? "text-green-500"
                      : changeType === "down"
                      ? "text-red-500"
                      : "text-muted-foreground"
                  }`}
                >
                  {change}
                </span>
              </div>
            </div>
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${accentColor}15` }}
            >
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================================
// Loading Skeleton for Metrics
// ============================================================

function MetricSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Dashboard Page
// ============================================================

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isPartner = user?.role === UserRole.PARTNER;

  // Fetch dashboard stats
  const {
    data: stats,
    isLoading: statsLoading,
  } = useApi<DashboardStats>(
    (signal) => dashboardApi.getStats(),
    []
  );

  // Fetch chart data (OS per month)
  const {
    data: chartData,
    isLoading: chartLoading,
  } = useApi<OsPerMonth[]>(
    (signal) => dashboardApi.getOsPerMonth(),
    []
  );

  // Fetch recent activity
  const {
    data: recentActivity,
    isLoading: activityLoading,
  } = useApi<OsStatusHistory[]>(
    (signal) => dashboardApi.getRecentActivity(),
    []
  );

  // Fetch upcoming schedules
  const {
    data: upcomingSchedules,
    isLoading: schedulesLoading,
  } = useApi<Schedule[]>(
    (signal) => dashboardApi.getUpcomingSchedules(),
    []
  );

  const isLoading = statsLoading || chartLoading || activityLoading || schedulesLoading;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  // Map chart data for recharts
  const mappedChartData = chartData?.map((item) => ({
    month: item.month,
    os: item.count,
  })) ?? [];

  // Pie chart data for status distribution
  const statusPieData = stats ? (
    isPartner
      ? [
          { name: "Abertos", value: stats.openOs, color: "#EAB308" },
          { name: "Em Andamento", value: stats.inProgressOs, color: "#3B82F6" },
          { name: "Concluidos", value: stats.completedOs, color: "#22C55E" },
        ].filter(d => d.value > 0)
      : [
          { name: "Abertas", value: stats.openOs, color: "#EAB308" },
          { name: "Em Andamento", value: stats.inProgressOs, color: "#3B82F6" },
          { name: "Concluidas", value: stats.completedOs, color: "#22C55E" },
          { name: "Atrasadas", value: stats.overdueOs, color: "#EF4444" },
        ].filter(d => d.value > 0)
  ) : [];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {getGreeting()},{" "}
          <span className="text-gradient">
            {user?.full_name?.split(" ")[0] || "Usuario"}
          </span>
        </h1>
        <p className="text-muted-foreground">
          {isPartner
            ? "Acompanhe seus chamados e servicos."
            : "Aqui esta o resumo das suas operacoes."}
        </p>
      </motion.div>

      {/* Metric Cards - Bento Grid */}
      <div className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        isPartner ? "xl:grid-cols-3" : "xl:grid-cols-4"
      )}>
        {statsLoading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            {!isPartner && <MetricSkeleton />}
          </>
        ) : isPartner ? (
          <>
            <MetricCard
              title="Meus Chamados Abertos"
              value={String(stats?.openOs ?? 0)}
              change="Total atual"
              changeType="neutral"
              icon={
                <ClipboardList className="h-5 w-5" style={{ color: "#EAB308" }} />
              }
              accentColor="#EAB308"
              delay={0}
            />
            <MetricCard
              title="Em Andamento"
              value={String(stats?.inProgressOs ?? 0)}
              change="Total atual"
              changeType="neutral"
              icon={<Clock className="h-5 w-5" style={{ color: "#3B82F6" }} />}
              accentColor="#3B82F6"
              delay={0.1}
            />
            <MetricCard
              title="Concluidos"
              value={String(stats?.completedOs ?? 0)}
              change="Total geral"
              changeType="up"
              icon={
                <CheckCircle2
                  className="h-5 w-5"
                  style={{ color: "#22C55E" }}
                />
              }
              accentColor="#22C55E"
              delay={0.2}
            />
          </>
        ) : (
          <>
            <MetricCard
              title="OS Abertas"
              value={String(stats?.openOs ?? 0)}
              change="Total atual"
              changeType="neutral"
              icon={
                <ClipboardList className="h-5 w-5" style={{ color: "#EAB308" }} />
              }
              accentColor="#EAB308"
              delay={0}
            />
            <MetricCard
              title="Em Andamento"
              value={String(stats?.inProgressOs ?? 0)}
              change="Total atual"
              changeType="neutral"
              icon={<Clock className="h-5 w-5" style={{ color: "#3B82F6" }} />}
              accentColor="#3B82F6"
              delay={0.1}
            />
            <MetricCard
              title="Concluidas"
              value={String(stats?.completedOs ?? 0)}
              change="Total geral"
              changeType="up"
              icon={
                <CheckCircle2
                  className="h-5 w-5"
                  style={{ color: "#22C55E" }}
                />
              }
              accentColor="#22C55E"
              delay={0.2}
            />
            <MetricCard
              title="Atrasadas"
              value={String(stats?.overdueOs ?? 0)}
              change={stats?.overdueOs ? "Requer atencao" : "Tudo em dia"}
              changeType={stats?.overdueOs ? "down" : "neutral"}
              icon={
                <AlertTriangle
                  className="h-5 w-5"
                  style={{ color: "#EF4444" }}
                />
              }
              accentColor="#EF4444"
              delay={0.3}
            />
          </>
        )}
      </div>

      {/* Charts & Lists - Bento Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chart - OS por mes (takes 2 columns) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="lg:col-span-2"
        >
          <Card hover>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {isPartner ? "Meus Chamados por Mes" : "OS por Mes"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {isPartner
                    ? "Evolucao dos seus chamados nos ultimos 12 meses"
                    : "Evolucao das ordens de servico nos ultimos 12 meses"}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart
                    data={mappedChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorOs"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#EAB308"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#EAB308"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        color: "var(--card-foreground)",
                      }}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="os"
                      stroke="#EAB308"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorOs)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Upcoming Schedules */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Card hover className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Proximos Agendamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {schedulesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : !upcomingSchedules || upcomingSchedules.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <CalendarDays className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum agendamento proximo
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingSchedules.map((schedule, index) => (
                    <motion.div
                      key={schedule.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.6 + index * 0.05,
                        duration: 0.3,
                      }}
                      className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent"
                    >
                      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {(schedule as any).service_order?.title || (schedule as any).service_order?.order_number || schedule.service_order_id}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {formatScheduleDate(
                              schedule.date,
                              schedule.start_time
                            )}
                          </span>
                          <span>&middot;</span>
                          <span>{(schedule as any).technician?.full_name || schedule.technician_id}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Status Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4 }}
        >
          <Card hover>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
                {isPartner ? "Distribuicao dos Chamados" : "Distribuicao por Status"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : statusPieData.length > 0 ? (
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {statusPieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "12px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          color: "var(--card-foreground)",
                        }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {statusPieData.map((item) => (
                      <div key={item.name} className="flex items-center gap-2 text-sm">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ background: item.color }}
                        />
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8">
                  <PieChartIcon className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum dado disponivel
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Activity - hidden for partners */}
      {!isPartner && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          <Card hover>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Atividade Recente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                      <Skeleton className="h-3 w-20" />
                    </div>
                  ))}
                </div>
              ) : !recentActivity || recentActivity.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Activity className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma atividade recente
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentActivity.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.7 + index * 0.05,
                        duration: 0.3,
                      }}
                      className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-accent"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {item.from_status
                            ? `OS alterada de ${item.from_status} para ${item.to_status}`
                            : `OS criada como ${item.to_status}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(item as any).changed_by_user?.full_name || item.changed_by}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
