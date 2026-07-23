"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DayInfo {
  available: boolean;
  is_weekend: boolean;
  is_holiday: boolean;
  holiday_name?: string;
  booked_slots: number;
  busy_full: boolean;
}

interface AvailabilityResponse {
  from: string;
  to: string;
  days: Record<string, DayInfo>;
}

interface Props {
  value: string; // yyyy-mm-dd
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const WEEK_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startWeekday = first.getDay();
  const start = new Date(first);
  start.setDate(1 - startWeekday);
  const grid: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    grid.push(d);
  }
  return { grid, first };
}

export function AvailabilityDatePicker({
  value,
  onChange,
  placeholder = "Escolha a data",
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(() =>
    value ? new Date(`${value}T00:00:00`) : new Date()
  );
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const from = fmtISO(first);
      const res = await apiClient.get<AvailabilityResponse>(
        `/calendar/availability?from=${from}&days=42`
      );
      setData(res);
    } catch (err) {
      console.error("availability load failed", err);
    } finally {
      setLoading(false);
    }
  }, [anchor]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const { grid, first } = daysGrid(anchor);
  const monthLabel = anchor.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const displayValue = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR")
    : "";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "flex-1 text-left",
            !displayValue && "text-muted-foreground"
          )}
        >
          {displayValue || placeholder}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 top-full z-50 mt-1 w-[320px] rounded-lg border bg-background p-3 shadow-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium capitalize">
                  {monthLabel}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setAnchor(
                        new Date(
                          anchor.getFullYear(),
                          anchor.getMonth() - 1,
                          1
                        )
                      )
                    }
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAnchor(new Date())}
                    className="h-7 text-xs"
                  >
                    Hoje
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setAnchor(
                        new Date(
                          anchor.getFullYear(),
                          anchor.getMonth() + 1,
                          1
                        )
                      )
                    }
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-[10px] uppercase text-muted-foreground mb-1">
                {WEEK_LABELS.map((w, i) => (
                  <div key={i} className="text-center py-1">
                    {w}
                  </div>
                ))}
              </div>
              {loading ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  Carregando disponibilidade...
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-0.5">
                  {grid.map((d) => {
                    const iso = fmtISO(d);
                    const inMonth = d.getMonth() === first.getMonth();
                    const info = data?.days[iso];
                    const isSelected = iso === value;
                    const isPast = iso < fmtISO(new Date());
                    const busy =
                      info?.is_holiday || info?.busy_full || isPast;
                    const weekend = info?.is_weekend;
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={busy || !inMonth}
                        onClick={() => {
                          onChange(iso);
                          setOpen(false);
                        }}
                        title={
                          info?.holiday_name ??
                          (info?.busy_full
                            ? "Sem vagas neste dia"
                            : weekend
                            ? "Fim de semana — +25% sobre serviços"
                            : "")
                        }
                        className={cn(
                          "aspect-square rounded-md text-xs font-medium transition relative",
                          !inMonth && "invisible",
                          !busy && "hover:bg-primary/10 cursor-pointer",
                          busy && "opacity-40 cursor-not-allowed line-through",
                          !busy && !weekend && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                          !busy && weekend && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                          isSelected &&
                            "ring-2 ring-primary bg-primary text-primary-foreground"
                        )}
                      >
                        {d.getDate()}
                        {info?.booked_slots ? (
                          <span className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-current opacity-60" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-3 mt-3 pt-2 border-t text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/60" />
                  Livre
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500/60" />
                  +25%
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                  Ocupado
                </div>
                {value && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 text-xs"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
