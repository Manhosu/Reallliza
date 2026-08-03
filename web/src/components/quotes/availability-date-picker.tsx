"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, X, Users } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Compat: modo legado (single date) chamando /calendar/availability
interface LegacyDayInfo {
  available: boolean;
  is_weekend: boolean;
  is_holiday: boolean;
  holiday_name?: string;
  booked_slots: number;
  busy_full: boolean;
}
interface LegacyResponse {
  from: string;
  to: string;
  days: Record<string, LegacyDayInfo>;
}

// Modo novo (multi-day + team-aware) chamando /calendar/team-availability
interface AvailableWindow {
  start: string;
  end: string;
  workdays: string[];
}
interface TeamAvailability {
  team_id: string;
  name: string;
  color: string;
  member_count: number;
  blocked_days: string[];
  available_windows: AvailableWindow[];
}
interface TeamAvailResponse {
  specialty_id: string | null;
  days_needed: number;
  from: string;
  horizon: number;
  teams: TeamAvailability[];
}

interface Props {
  value: string | string[]; // legado: 'yyyy-mm-dd'; novo: array de N ISOs
  onChange: (block: string | string[], teamId?: string) => void;
  daysNeeded?: number;
  specialtyId?: string | null;
  allowWeekend?: boolean;
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

function isWeekend(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00`);
  const dow = d.getDay();
  return dow === 0 || dow === 6;
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

/**
 * Constroi bloco de N dias uteis consecutivos a partir de startISO,
 * pulando fim de semana, feriados e dias bloqueados.
 */
function tryBuildBlock(
  startISO: string,
  daysNeeded: number,
  holidays: Set<string>,
  blocked: Set<string>,
  allowWeekend = false
): string[] | null {
  const days: string[] = [];
  const cursor = new Date(`${startISO}T00:00:00`);
  let safety = 0;
  while (days.length < daysNeeded && safety < 120) {
    const iso = fmtISO(cursor);
    const skip =
      (!allowWeekend && isWeekend(iso)) ||
      holidays.has(iso) ||
      blocked.has(iso);
    if (!skip) days.push(iso);
    cursor.setDate(cursor.getDate() + 1);
    safety++;
  }
  return days.length === daysNeeded ? days : null;
}

export function AvailabilityDatePicker({
  value,
  onChange,
  daysNeeded = 1,
  specialtyId,
  allowWeekend = false,
  placeholder = "Escolha a data",
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const isMulti = daysNeeded > 1 || Array.isArray(value);
  const currentBlock: string[] = Array.isArray(value)
    ? value
    : value
      ? [value]
      : [];
  const firstDate = currentBlock[0] ?? "";
  const [anchor, setAnchor] = useState(() =>
    firstDate ? new Date(`${firstDate}T00:00:00`) : new Date()
  );
  const [legacyData, setLegacyData] = useState<LegacyResponse | null>(null);
  const [teamData, setTeamData] = useState<TeamAvailResponse | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const from = fmtISO(first);
      if (specialtyId) {
        const res = await apiClient.get<TeamAvailResponse>(
          `/calendar/team-availability?specialty_id=${specialtyId}&days_needed=${daysNeeded}&from=${from}&horizon=60`
        );
        setTeamData(res);
        if (res.teams.length > 0 && !selectedTeamId) {
          setSelectedTeamId(res.teams[0].team_id);
        }
      } else {
        const res = await apiClient.get<LegacyResponse>(
          `/calendar/availability?from=${from}&days=42`
        );
        setLegacyData(res);
      }
    } catch (err) {
      console.error("availability load failed", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, specialtyId, daysNeeded]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const { grid, first } = daysGrid(anchor);
  const monthLabel = anchor.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const displayValue = (() => {
    if (currentBlock.length === 0) return "";
    if (currentBlock.length === 1) {
      return new Date(`${currentBlock[0]}T00:00:00`).toLocaleDateString(
        "pt-BR"
      );
    }
    const start = new Date(`${currentBlock[0]}T00:00:00`).toLocaleDateString(
      "pt-BR"
    );
    const end = new Date(
      `${currentBlock[currentBlock.length - 1]}T00:00:00`
    ).toLocaleDateString("pt-BR");
    return `${start} → ${end}`;
  })();

  // Prepara sets de bloqueio para o mes atual
  const activeTeam = specialtyId
    ? teamData?.teams.find((t) => t.team_id === selectedTeamId)
    : null;
  const blocked = new Set<string>(activeTeam?.blocked_days ?? []);
  const holidays = new Set<string>(); // team-availability ja considera na janela

  const selectedSet = new Set<string>(currentBlock);

  const handleClick = (d: Date) => {
    const iso = fmtISO(d);
    if (specialtyId) {
      if (!teamData || !activeTeam) return;
      // Jessica 03/08: allowWeekend permite selecionar sabado/domingo
      const block = tryBuildBlock(
        iso,
        daysNeeded,
        holidays,
        blocked,
        allowWeekend
      );
      if (!block) return;
      if (blocked.has(iso) || (!allowWeekend && isWeekend(iso))) {
        return;
      }
      onChange(daysNeeded === 1 && isMulti === false ? block[0] : block, selectedTeamId);
      setOpen(false);
    } else {
      // Modo legado: 1 clique = 1 dia
      onChange(iso);
      setOpen(false);
    }
  };

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
            "flex-1 text-left truncate",
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
              className="absolute left-0 top-full z-50 mt-1 w-[340px] rounded-lg border bg-background p-3 shadow-lg"
            >
              {specialtyId && teamData && (
                <div className="mb-2 border-b pb-2">
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> Equipe
                  </div>
                  {teamData.teams.length === 0 ? (
                    <div className="text-xs text-destructive py-2">
                      Nenhuma equipe qualificada nessa especialidade.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {teamData.teams.map((t) => (
                        <button
                          key={t.team_id}
                          type="button"
                          onClick={() => setSelectedTeamId(t.team_id)}
                          className={cn(
                            "text-xs px-2 py-1 rounded-md border transition",
                            selectedTeamId === t.team_id
                              ? "border-primary"
                              : "border-transparent hover:border-input"
                          )}
                          style={{
                            background:
                              selectedTeamId === t.team_id
                                ? `${t.color}22`
                                : undefined,
                          }}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full mr-1"
                            style={{ background: t.color }}
                          />
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                    const isPast = iso < fmtISO(new Date());
                    const isSelected = selectedSet.has(iso);
                    const isBlockedByTeam = blocked.has(iso);

                    // Modo legado
                    const legacyInfo = legacyData?.days[iso];
                    const legacyBusy = specialtyId
                      ? false
                      : legacyInfo?.is_holiday ||
                        legacyInfo?.busy_full ||
                        isPast;
                    const legacyWeekend = specialtyId
                      ? false
                      : legacyInfo?.is_weekend;

                    // Modo novo (team)
                    const teamWeekend = specialtyId ? isWeekend(iso) : false;
                    const teamBusy =
                      specialtyId && (isPast || isBlockedByTeam || teamWeekend);

                    const busy = specialtyId ? teamBusy : legacyBusy;
                    const weekend = specialtyId ? teamWeekend : legacyWeekend;

                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={!!busy || !inMonth}
                        onClick={() => handleClick(d)}
                        title={
                          isBlockedByTeam
                            ? `Equipe ${activeTeam?.name ?? ""} ocupada`
                            : weekend
                              ? "Fim de semana"
                              : legacyInfo?.holiday_name ?? ""
                        }
                        className={cn(
                          "aspect-square rounded-md text-xs font-medium transition relative",
                          !inMonth && "invisible",
                          !busy && "hover:bg-primary/10 cursor-pointer",
                          busy && "opacity-40 cursor-not-allowed line-through",
                          !busy &&
                            !weekend &&
                            "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                          !busy &&
                            weekend &&
                            "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                          isSelected &&
                            "ring-2 ring-primary bg-primary text-primary-foreground"
                        )}
                      >
                        {d.getDate()}
                        {isBlockedByTeam && (
                          <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />
                        )}
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
                  Fim de semana
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                  Ocupado
                </div>
                {currentBlock.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 text-xs"
                    onClick={() => {
                      onChange(isMulti ? [] : "", selectedTeamId);
                      setOpen(false);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
              </div>
              {specialtyId &&
                daysNeeded > 1 &&
                activeTeam &&
                activeTeam.available_windows.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">
                      Próximas janelas ({daysNeeded} dias)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeTeam.available_windows.slice(0, 3).map((w) => (
                        <button
                          key={w.start}
                          type="button"
                          onClick={() => {
                            onChange(w.workdays, selectedTeamId);
                            setOpen(false);
                          }}
                          className="text-[10px] px-2 py-1 rounded-md border hover:bg-primary/10"
                        >
                          {new Date(
                            `${w.start}T00:00:00`
                          ).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                          })}{" "}
                          →{" "}
                          {new Date(
                            `${w.end}T00:00:00`
                          ).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
