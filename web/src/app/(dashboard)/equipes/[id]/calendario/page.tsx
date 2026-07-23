"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Calendar as CalendarIcon,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { teamsApi } from "@/lib/api";
import type { TeamCalendarResponse, TeamCalendarEvent } from "@/lib/api/teams";
import { UserRole } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

const WEEK_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysInMonthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startWeekday = first.getDay(); // 0=Dom
  const startDate = new Date(first);
  startDate.setDate(1 - startWeekday);

  const grid: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    grid.push(d);
  }
  return { grid, first };
}

export default function EquipeCalendarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { id: teamId } = use(params);

  useEffect(() => {
    if (user && user.role !== UserRole.ADMIN) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const [anchor, setAnchor] = useState(() => new Date());
  const [data, setData] = useState<TeamCalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Date | null>(null);

  const { grid, first } = daysInMonthGrid(anchor);
  const monthLabel = anchor.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = fmtISO(grid[0]);
      const days = 42;
      const res = await teamsApi.calendar(teamId, { from, days });
      setData(res);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar calendário");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, anchor]);

  useEffect(() => {
    load();
  }, [load]);

  const eventsByDate = new Map<string, TeamCalendarEvent[]>();
  for (const e of data?.events ?? []) {
    if (!e.date) continue;
    const list = eventsByDate.get(e.date) ?? [];
    list.push(e);
    eventsByDate.set(e.date, list);
  }

  const teamColor = data?.team.color ?? "#EAB308";
  const selectedIso = selected ? fmtISO(selected) : null;
  const selectedEvents = selectedIso ? eventsByDate.get(selectedIso) ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.push("/equipes")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: teamColor }}
            />
            <h1 className="text-2xl font-semibold">
              {loading ? "Calendário" : `Equipe ${data?.team.name}`}
            </h1>
          </div>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.member_count} membro(s) · {data.events.length} evento(s)
              no período
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg capitalize flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" style={{ color: teamColor }} />
            {monthLabel}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAnchor(new Date())}
            >
              Hoje
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-xs uppercase text-muted-foreground mb-1">
            {WEEK_LABELS.map((w) => (
              <div key={w} className="p-2 text-center font-medium">
                {w}
              </div>
            ))}
          </div>
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 42 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d) => {
                const iso = fmtISO(d);
                const inMonth = d.getMonth() === first.getMonth();
                const isToday = iso === fmtISO(new Date());
                const isSelected = iso === selectedIso;
                const events = eventsByDate.get(iso) ?? [];
                return (
                  <button
                    key={iso}
                    onClick={() => setSelected(d)}
                    className={cn(
                      "min-h-[6rem] p-2 rounded-lg border text-left transition",
                      inMonth
                        ? "bg-background hover:bg-secondary/50"
                        : "bg-secondary/20 text-muted-foreground/50",
                      isToday && "border-primary/60",
                      isSelected && "ring-2 ring-primary"
                    )}
                  >
                    <div
                      className={cn(
                        "text-sm font-medium mb-1",
                        isToday && "text-primary"
                      )}
                    >
                      {d.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {events.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          className="text-[10px] px-1 py-0.5 rounded truncate"
                          style={{
                            background: `${teamColor}25`,
                            color: teamColor,
                            border: `1px solid ${teamColor}50`,
                          }}
                        >
                          {e.start_time?.slice(0, 5)} {e.title}
                        </div>
                      ))}
                      {events.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{events.length - 3} mais
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {selected.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
              </CardTitle>
              <Badge variant="secondary">
                {selectedEvents.length} evento(s)
              </Badge>
            </CardHeader>
            <CardContent>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nenhum evento neste dia.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((e) => (
                    <div
                      key={e.id}
                      className="p-3 rounded-lg border hover:bg-secondary/50 flex items-center gap-3"
                    >
                      <div className="text-xs text-muted-foreground w-14 shrink-0">
                        {e.start_time?.slice(0, 5) ?? "--:--"}
                        {e.end_time && (
                          <>
                            <br />
                            {e.end_time.slice(0, 5)}
                          </>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{e.title}</div>
                        {e.service_order && (
                          <div className="text-xs text-muted-foreground">
                            OS #{e.service_order.order_number} ·{" "}
                            {e.service_order.client_name}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {e.status}
                      </Badge>
                      {e.service_order_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            router.push(`/os/${e.service_order_id}`)
                          }
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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
