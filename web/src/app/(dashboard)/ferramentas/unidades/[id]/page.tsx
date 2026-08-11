"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft, History, Package, User } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toolsApi } from "@/lib/api";
import type { ToolUnit, ToolEvent } from "@/lib/tools/types";
import { EVENT_TYPE_LABELS } from "@/lib/tools/types";
import { UnitStatusBadge, DeadlineBadge } from "@/components/ferramentas/almox-badges";

interface UnitDetail extends ToolUnit {
  current_custody: {
    id: string;
    checked_out_at: string;
    expected_return_at: string | null;
    return_requested_at: string | null;
    user?: { id: string; full_name: string; phone?: string } | null;
    service_order?: { id: string; order_number: string; title: string } | null;
  } | null;
  summary: {
    total_checkouts: number;
    total_maintenances: number;
    total_damages: number;
    distinct_technicians: number;
    maintenance_cost: number;
    last_event: { event_type: string; created_at: string } | null;
  };
}

/**
 * Ficha da unidade física + histórico permanente (spec seções 7, 23-27).
 * "Esse histórico pertence à ferramenta. Não é o histórico do técnico."
 */
export default function UnidadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [events, setEvents] = useState<ToolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState("all");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, h] = await Promise.all([
        toolsApi.getUnit(id),
        toolsApi.getUnitHistory(id, {
          event_type: eventType === "all" ? undefined : eventType,
          order,
        }),
      ]);
      setUnit(u as unknown as UnitDetail);
      setEvents(h ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar a unidade");
    } finally {
      setLoading(false);
    }
  }, [id, eventType, order]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !unit) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!unit) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" />}
        title="Unidade não encontrada"
        description="Ela pode ter sido removida ou o link está errado."
      />
    );
  }

  const s = unit.summary;

  return (
    <div className="space-y-5">
      <Link
        href="/ferramentas/inventario"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao inventário
      </Link>

      {/* Cabeçalho da unidade */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 py-5">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary/40">
            {unit.photos?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={unit.photos[0].url}
                alt={unit.code}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Package className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{unit.tool?.name ?? "Ferramenta"}</h1>
              <UnitStatusBadge status={unit.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {unit.code}
              {unit.patrimony_code && ` · ${unit.patrimony_code}`}
              {unit.serial_number && ` · S/N ${unit.serial_number}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[unit.tool?.brand, unit.tool?.model].filter(Boolean).join(" ") || "—"}
              {unit.location && ` · ${unit.location}`}
            </p>
          </div>

          {unit.current_custody && (
            <div className="rounded-xl border border-border p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Em custódia com
              </p>
              <p className="text-sm font-medium">
                {unit.current_custody.user?.full_name ?? "—"}
              </p>
              {unit.current_custody.service_order && (
                <p className="text-xs text-muted-foreground">
                  OS #{unit.current_custody.service_order.order_number}
                </p>
              )}
              <div className="mt-1.5">
                <DeadlineBadge custody={unit.current_custody} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo de vida útil (seção 26) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniStat label="Retiradas" value={s.total_checkouts} />
        <MiniStat label="Técnicos que usaram" value={s.distinct_technicians} />
        <MiniStat label="Manutenções" value={s.total_maintenances} />
        <MiniStat label="Danos" value={s.total_damages} />
        <MiniStat
          label="Custo de manutenção"
          value={s.maintenance_cost.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        />
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Histórico da unidade
          </CardTitle>
          <div className="flex gap-2">
            <SelectNative
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-52"
            >
              <option value="all">Todos os eventos</option>
              {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectNative>
            <SelectNative
              value={order}
              onChange={(e) => setOrder(e.target.value as "asc" | "desc")}
              className="w-44"
            >
              <option value="desc">Mais recente primeiro</option>
              <option value="asc">Mais antigo primeiro</option>
            </SelectNative>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              icon={<History className="h-6 w-6" />}
              title="Sem eventos"
              description="Nada registrado para esta unidade com os filtros atuais."
            />
          ) : (
            <ol className="relative space-y-0 border-l border-border pl-6">
              {events.map((e) => (
                <li key={e.id} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-sm font-medium">
                      {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("pt-BR")}
                    </span>
                    {e.status_from && e.status_to && (
                      <span className="text-[11px] text-muted-foreground">
                        {e.status_from} → {e.status_to}
                      </span>
                    )}
                  </div>
                  {e.description && (
                    <p className="text-sm text-muted-foreground">{e.description}</p>
                  )}
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {e.technician?.full_name && <span>Técnico: {e.technician.full_name}</span>}
                    {e.almoxarife?.full_name && (
                      <span>Almoxarifado: {e.almoxarife.full_name}</span>
                    )}
                    {e.service_order?.order_number && (
                      <span>OS #{e.service_order.order_number}</span>
                    )}
                  </div>
                  {e.notes && (
                    <p className="mt-1 text-xs italic text-muted-foreground">{e.notes}</p>
                  )}
                  {e.photos?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.photos.map((p) => (
                        <a
                          key={p.storage_path ?? p.url}
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-12 w-12 overflow-hidden rounded border border-border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
