"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  CalendarDays,
  Grid3X3,
  User,
  Plus,
  X,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  isSameMonth,
  getDay,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleStatus, OsStatus, UserRole, type Schedule, type ServiceOrder, type Profile } from "@/lib/types";
import { schedulesApi, serviceOrdersApi, usersApi } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { toast } from "sonner";

// ============================================================
// Types & Config
// ============================================================

type ViewMode = "week" | "month" | "list";

const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  [ScheduleStatus.SCHEDULED]: "Agendado",
  [ScheduleStatus.CONFIRMED]: "Confirmado",
  [ScheduleStatus.IN_PROGRESS]: "Em Andamento",
  [ScheduleStatus.COMPLETED]: "Concluído",
  [ScheduleStatus.CANCELLED]: "Cancelado",
  [ScheduleStatus.RESCHEDULED]: "Reagendado",
};

const SCHEDULE_STATUS_COLORS: Record<
  ScheduleStatus,
  { bg: string; border: string; text: string }
> = {
  [ScheduleStatus.SCHEDULED]: {
    bg: "bg-yellow-500/10",
    border: "border-l-yellow-500",
    text: "text-yellow-600 dark:text-yellow-400",
  },
  [ScheduleStatus.CONFIRMED]: {
    bg: "bg-blue-500/10",
    border: "border-l-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  [ScheduleStatus.IN_PROGRESS]: {
    bg: "bg-green-500/10",
    border: "border-l-green-500",
    text: "text-green-600 dark:text-green-400",
  },
  [ScheduleStatus.COMPLETED]: {
    bg: "bg-zinc-500/10",
    border: "border-l-zinc-400",
    text: "text-zinc-500",
  },
  [ScheduleStatus.CANCELLED]: {
    bg: "bg-red-500/10",
    border: "border-l-red-500",
    text: "text-red-500",
  },
  [ScheduleStatus.RESCHEDULED]: {
    bg: "bg-purple-500/10",
    border: "border-l-purple-500",
    text: "text-purple-500",
  },
};

const HOUR_SLOTS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 to 19:00

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

// ============================================================
// Helper functions
// ============================================================

function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);
  return { hour: h, minute: m };
}

function getScheduleTopAndHeight(
  startTime: string,
  endTime: string
): { top: number; height: number } {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const startOffset = (start.hour - 7) * 64 + (start.minute / 60) * 64;
  const duration =
    (end.hour - start.hour) * 64 + ((end.minute - start.minute) / 60) * 64;
  return { top: startOffset, height: Math.max(duration, 32) };
}

// ============================================================
// Week View Skeleton
// ============================================================

function WeekViewSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-8 gap-0">
          <div className="w-14" />
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1 pb-3">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Schedule Block Component
// ============================================================

function ScheduleBlock({
  schedule,
}: {
  schedule: Schedule;
}) {
  const colors = SCHEDULE_STATUS_COLORS[schedule.status];

  if (!schedule.start_time || !schedule.end_time) {
    return null;
  }

  const { top, height } = getScheduleTopAndHeight(
    schedule.start_time,
    schedule.end_time
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "absolute inset-x-1 z-10 cursor-pointer overflow-hidden rounded-lg border-l-[3px] px-2 py-1.5 transition-all duration-200 hover:shadow-md",
        colors.bg,
        colors.border
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
      }}
    >
      <p className={cn("truncate text-[11px] font-semibold", colors.text)}>
        {schedule.service_order?.title || schedule.service_order?.order_number || schedule.service_order_id.slice(0, 8)}
      </p>
      {height > 48 && (
        <p className="truncate text-[10px] text-muted-foreground">
          {schedule.technician?.full_name || schedule.technician_id.slice(0, 8)}
        </p>
      )}
      {height > 64 && (
        <p className="text-[10px] text-muted-foreground/70">
          {schedule.start_time} - {schedule.end_time}
        </p>
      )}
    </motion.div>
  );
}

// ============================================================
// Agenda Page
// ============================================================

export default function AgendaPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  // Create schedule modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);
  const [osList, setOsList] = useState<ServiceOrder[]>([]);
  const [techniciansList, setTechniciansList] = useState<Profile[]>([]);
  const [scheduleForm, setScheduleForm] = useState({
    service_order_id: "",
    technician_id: "",
    date: "",
    start_time: "",
    end_time: "",
    notes: "",
  });

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Week days
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Month days
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad month days to start on Monday
  const monthStartDay = getDay(monthStart);
  const paddingDays = monthStartDay === 0 ? 6 : monthStartDay - 1;
  const prevMonthEnd = new Date(monthStart);
  prevMonthEnd.setDate(prevMonthEnd.getDate() - 1);
  const paddedStartDays = Array.from({ length: paddingDays }, (_, i) => {
    const d = new Date(prevMonthEnd);
    d.setDate(d.getDate() - (paddingDays - 1 - i));
    return d;
  });

  // Compute the date range for fetching based on view mode
  const dateFrom = useMemo(() => {
    if (viewMode === "month") {
      return format(monthStart, "yyyy-MM-dd");
    }
    // For week and list, use the week range
    return format(weekStart, "yyyy-MM-dd");
  }, [viewMode, weekStart, monthStart]);

  const dateTo = useMemo(() => {
    if (viewMode === "month") {
      return format(monthEnd, "yyyy-MM-dd");
    }
    return format(weekEnd, "yyyy-MM-dd");
  }, [viewMode, weekEnd, monthEnd]);

  // Fetch schedules for the current date range
  const {
    data: schedulesResponse,
    isLoading,
    mutate,
  } = useApi(
    (signal) =>
      schedulesApi.list({
        date_from: dateFrom,
        date_to: dateTo,
        limit: 100,
      }),
    [dateFrom, dateTo]
  );

  const schedules: Schedule[] = schedulesResponse?.data ?? [];

  // Navigation
  const navigate = (direction: "prev" | "next") => {
    if (viewMode === "week" || viewMode === "list") {
      setCurrentDate(
        direction === "prev"
          ? subWeeks(currentDate, 1)
          : addWeeks(currentDate, 1)
      );
    } else {
      setCurrentDate(
        direction === "prev"
          ? subMonths(currentDate, 1)
          : addMonths(currentDate, 1)
      );
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  // Get schedules for a specific day
  const getSchedulesForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return schedules.filter((s) => s.date === dateStr);
  };

  // Current time indicator position
  const currentTimeTop = useMemo(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    if (hours < 7 || hours >= 20) return null;
    return (hours - 7) * 64 + (minutes / 60) * 64;
  }, [currentTime]);

  // Format header date range
  const headerDateRange =
    viewMode === "week" || viewMode === "list"
      ? `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(
          weekEnd,
          "dd MMM yyyy",
          { locale: ptBR }
        )}`
      : format(currentDate, "MMMM yyyy", { locale: ptBR });

  // List view schedules (sorted chronologically, excluding cancelled/completed)
  const listSchedules = [...schedules]
    .filter(
      (s) =>
        s.status !== ScheduleStatus.CANCELLED &&
        s.status !== ScheduleStatus.COMPLETED
    )
    .sort((a, b) => {
      const dateA = `${a.date}T${a.start_time || "00:00"}`;
      const dateB = `${b.date}T${b.start_time || "00:00"}`;
      return dateA.localeCompare(dateB);
    });

  const handleOpenCreateModal = async () => {
    setScheduleForm({
      service_order_id: "",
      technician_id: "",
      date: format(currentDate, "yyyy-MM-dd"),
      start_time: "08:00",
      end_time: "10:00",
      notes: "",
    });
    setShowCreateModal(true);
    setLoadingDropdowns(true);
    try {
      const [osRes, techRes] = await Promise.all([
        serviceOrdersApi.list({ limit: 100 }),
        usersApi.list({ role: UserRole.TECHNICIAN, limit: 100 }),
      ]);
      setOsList(osRes.data);
      setTechniciansList(techRes.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dados";
      toast.error(message);
    } finally {
      setLoadingDropdowns(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!scheduleForm.service_order_id) {
      toast.error("Selecione uma OS");
      return;
    }
    if (!scheduleForm.technician_id) {
      toast.error("Selecione um técnico");
      return;
    }
    if (!scheduleForm.date) {
      toast.error("Informe a data");
      return;
    }
    if (!scheduleForm.start_time) {
      toast.error("Informe o horário de início");
      return;
    }
    setIsCreatingSchedule(true);
    try {
      await schedulesApi.create({
        service_order_id: scheduleForm.service_order_id,
        technician_id: scheduleForm.technician_id,
        date: scheduleForm.date,
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time || null,
        notes: scheduleForm.notes.trim() || null,
      });
      toast.success("Agendamento criado com sucesso");
      setShowCreateModal(false);
      mutate();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao criar agendamento";
      toast.error(message);
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  const viewModeOptions: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    { value: "week", label: "Semana", icon: <CalendarDays className="h-4 w-4" /> },
    { value: "month", label: "Mês", icon: <Grid3X3 className="h-4 w-4" /> },
    { value: "list", label: "Lista", icon: <List className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
              Agenda
            </h1>
          </div>
          <p className="text-sm capitalize text-muted-foreground">
            {headerDateRange}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Create schedule button */}
          <Button onClick={handleOpenCreateModal}>
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </Button>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("prev")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              className="px-4"
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("next")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* View Toggle */}
          <div className="flex gap-0.5 rounded-xl bg-secondary/50 p-0.5">
            {viewModeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setViewMode(option.value)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
                  viewMode === option.value
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {viewMode === option.value && (
                  <motion.div
                    layoutId="activeViewTab"
                    className="absolute inset-0 rounded-lg bg-background shadow-sm"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {option.icon}
                  <span className="hidden sm:inline">{option.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {/* ============================== WEEK VIEW ============================== */}
        {viewMode === "week" && (
          <motion.div
            key="week"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {isLoading ? (
              <WeekViewSkeleton />
            ) : (
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <div className="min-w-[800px]">
                      {/* Day Headers */}
                      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
                        <div className="border-r border-border" />
                        {weekDays.map((day) => {
                          const dayIsToday = isToday(day);
                          const dayIndex =
                            getDay(day) === 0 ? 6 : getDay(day) - 1;
                          return (
                            <div
                              key={day.toISOString()}
                              className={cn(
                                "flex flex-col items-center gap-0.5 border-r border-border py-3 last:border-r-0",
                                dayIsToday && "bg-primary/5"
                              )}
                            >
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  dayIsToday
                                    ? "text-primary"
                                    : "text-muted-foreground"
                                )}
                              >
                                {WEEKDAY_LABELS[dayIndex]}
                              </span>
                              <span
                                className={cn(
                                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                                  dayIsToday
                                    ? "bg-primary text-primary-foreground"
                                    : "text-foreground"
                                )}
                              >
                                {format(day, "d")}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Time Grid */}
                      <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
                        {/* Time Labels */}
                        <div className="border-r border-border">
                          {HOUR_SLOTS.map((hour) => (
                            <div
                              key={hour}
                              className="flex h-16 items-start justify-end border-b border-border pr-2 pt-0"
                            >
                              <span className="relative -top-2 text-[10px] font-medium text-muted-foreground">
                                {String(hour).padStart(2, "0")}:00
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Day Columns */}
                        {weekDays.map((day) => {
                          const daySchedules = getSchedulesForDay(day);
                          const dayIsToday = isToday(day);
                          return (
                            <div
                              key={day.toISOString()}
                              className={cn(
                                "relative border-r border-border last:border-r-0",
                                dayIsToday && "bg-primary/[0.02]"
                              )}
                            >
                              {/* Hour lines */}
                              {HOUR_SLOTS.map((hour) => (
                                <div
                                  key={hour}
                                  className="h-16 border-b border-border"
                                />
                              ))}

                              {/* Current time indicator */}
                              {dayIsToday && currentTimeTop !== null && (
                                <div
                                  className="absolute inset-x-0 z-20 flex items-center"
                                  style={{ top: `${currentTimeTop}px` }}
                                >
                                  <div className="h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-red-500" />
                                  <div className="h-[2px] flex-1 bg-red-500" />
                                </div>
                              )}

                              {/* Schedule Blocks */}
                              {daySchedules.map((schedule) => (
                                <ScheduleBlock
                                  key={schedule.id}
                                  schedule={schedule}
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* ============================== MONTH VIEW ============================== */}
        {viewMode === "month" && (
          <motion.div
            key="month"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-[400px] w-full" />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  {/* Weekday Headers */}
                  <div className="mb-2 grid grid-cols-7 gap-1">
                    {WEEKDAY_LABELS.map((label) => (
                      <div
                        key={label}
                        className="py-2 text-center text-xs font-medium text-muted-foreground"
                      >
                        {label}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {/* Padding days from previous month */}
                    {paddedStartDays.map((day, index) => (
                      <div
                        key={`pad-${index}`}
                        className="flex min-h-[80px] flex-col rounded-lg p-2 opacity-30"
                      >
                        <span className="text-xs text-muted-foreground">
                          {format(day, "d")}
                        </span>
                      </div>
                    ))}

                    {/* Current month days */}
                    {monthDays.map((day) => {
                      const daySchedules = getSchedulesForDay(day);
                      const dayIsToday = isToday(day);

                      return (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            "flex min-h-[80px] flex-col rounded-lg border p-2 transition-colors hover:bg-accent/50",
                            dayIsToday
                              ? "border-primary/30 bg-primary/5"
                              : "border-transparent"
                          )}
                        >
                          <span
                            className={cn(
                              "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                              dayIsToday
                                ? "bg-primary text-primary-foreground"
                                : "text-foreground"
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          {/* Dots for scheduled days */}
                          {daySchedules.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-0.5">
                              {daySchedules.slice(0, 3).map((s) => {
                                const colors =
                                  SCHEDULE_STATUS_COLORS[s.status];
                                return (
                                  <div
                                    key={s.id}
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      s.status === ScheduleStatus.SCHEDULED &&
                                        "bg-yellow-500",
                                      s.status === ScheduleStatus.CONFIRMED &&
                                        "bg-blue-500",
                                      s.status ===
                                        ScheduleStatus.IN_PROGRESS &&
                                        "bg-green-500",
                                      s.status === ScheduleStatus.COMPLETED &&
                                        "bg-zinc-400",
                                      s.status === ScheduleStatus.CANCELLED &&
                                        "bg-red-500",
                                      s.status ===
                                        ScheduleStatus.RESCHEDULED &&
                                        "bg-purple-500"
                                    )}
                                  />
                                );
                              })}
                              {daySchedules.length > 3 && (
                                <span className="text-[9px] text-muted-foreground">
                                  +{daySchedules.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          {/* Show first schedule title on larger screens */}
                          {daySchedules.length > 0 && (
                            <div className="mt-0.5 hidden xl:block">
                              {daySchedules.slice(0, 1).map((s) => {
                                const colors =
                                  SCHEDULE_STATUS_COLORS[s.status];
                                return (
                                  <p
                                    key={s.id}
                                    className={cn(
                                      "truncate rounded px-1 py-0.5 text-[9px] font-medium",
                                      colors.bg,
                                      colors.text
                                    )}
                                  >
                                    {s.service_order?.title || s.service_order?.order_number || s.service_order_id.slice(0, 8)}
                                  </p>
                                );
                              })}
                              {daySchedules.length > 1 && (
                                <p className="px-1 text-[9px] text-muted-foreground">
                                  +{daySchedules.length - 1} mais
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* ============================== LIST VIEW ============================== */}
        {viewMode === "list" && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded-xl" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-lg" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : listSchedules.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Card>
                  <CardContent>
                    <EmptyState
                      icon={<Calendar className="h-6 w-6" />}
                      title="Nenhum agendamento encontrado"
                      description="Crie um novo agendamento para começar a organizar sua agenda."
                      action={
                        <Button onClick={handleOpenCreateModal}>
                          <Plus className="h-4 w-4" />
                          Novo Agendamento
                        </Button>
                      }
                    />
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              listSchedules.map((schedule, index) => {
                const colors = SCHEDULE_STATUS_COLORS[schedule.status];
                const schedDate = parseISO(schedule.date);

                return (
                  <motion.div
                    key={schedule.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                  >
                    <Card hover className="cursor-pointer overflow-hidden">
                      <div
                        className={cn("h-[2px]", {
                          "bg-yellow-500":
                            schedule.status === ScheduleStatus.SCHEDULED,
                          "bg-blue-500":
                            schedule.status === ScheduleStatus.CONFIRMED,
                          "bg-green-500":
                            schedule.status === ScheduleStatus.IN_PROGRESS,
                          "bg-zinc-400":
                            schedule.status === ScheduleStatus.COMPLETED,
                        })}
                      />
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          {/* Date block */}
                          <div
                            className={cn(
                              "flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl",
                              isToday(schedDate)
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary"
                            )}
                          >
                            <span className="text-[10px] font-medium uppercase">
                              {format(schedDate, "MMM", { locale: ptBR })}
                            </span>
                            <span className="text-lg font-bold leading-tight">
                              {format(schedDate, "dd")}
                            </span>
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {schedule.service_order?.title || schedule.service_order?.order_number || schedule.service_order_id.slice(0, 8)}
                            </p>
                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {schedule.technician?.full_name || schedule.technician_id.slice(0, 8)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {schedule.start_time} -{" "}
                                {schedule.end_time}
                              </span>
                            </div>
                          </div>

                          {/* Status badge */}
                          <span
                            className={cn(
                              "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium",
                              colors.bg,
                              colors.text
                            )}
                          >
                            {SCHEDULE_STATUS_LABELS[schedule.status]}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ Create Schedule Modal ============ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Novo Agendamento</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <SelectNative
                label="Ordem de Serviço *"
                value={scheduleForm.service_order_id}
                onChange={(e) => setScheduleForm({ ...scheduleForm, service_order_id: e.target.value })}
                disabled={loadingDropdowns}
              >
                <option value="">{loadingDropdowns ? "Carregando..." : "Selecione uma OS"}</option>
                {osList.map((os) => (
                  <option key={os.id} value={os.id}>
                    {os.order_number} - {os.title}
                  </option>
                ))}
              </SelectNative>
              <SelectNative
                label="Técnico *"
                value={scheduleForm.technician_id}
                onChange={(e) => setScheduleForm({ ...scheduleForm, technician_id: e.target.value })}
                disabled={loadingDropdowns}
              >
                <option value="">{loadingDropdowns ? "Carregando..." : "Selecione um técnico"}</option>
                {techniciansList.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name}
                  </option>
                ))}
              </SelectNative>
              <Input
                label="Data *"
                type="date"
                value={scheduleForm.date}
                onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Hora Início"
                  type="time"
                  value={scheduleForm.start_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                />
                <Input
                  label="Hora Fim"
                  type="time"
                  value={scheduleForm.end_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Observações</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Observações sobre o agendamento..."
                  className={cn(
                    "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200 resize-none"
                  )}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={isCreatingSchedule}>
                Cancelar
              </Button>
              <Button onClick={handleCreateSchedule} isLoading={isCreatingSchedule}>
                <Plus className="h-4 w-4" />
                Criar Agendamento
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
