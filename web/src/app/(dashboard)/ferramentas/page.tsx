"use client";

import Link from "next/link";
import {
  Package,
  Bookmark,
  PackageOpen,
  ShoppingBag,
  User,
  Undo2,
  Clock,
  AlertTriangle,
  Wrench,
  ShieldAlert,
  CalendarClock,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useApi } from "@/hooks/use-api";
import { toolsApi } from "@/lib/api";
import type { ToolsDashboard } from "@/lib/api/tools";
import { KpiTile } from "@/components/ferramentas/kpi-tile";
import { RequestStatusBadge, DeadlineBadge } from "@/components/ferramentas/almox-badges";
import { EVENT_TYPE_LABELS } from "@/lib/tools/types";

/**
 * Dashboard do almoxarifado (spec seção 4).
 * "O objetivo é mostrar ao operador tudo que precisa de atenção imediata."
 */
export default function AlmoxarifadoDashboard() {
  const { data, isLoading, mutate } = useApi<ToolsDashboard>(
    () => toolsApi.getDashboard(),
    []
  );

  const ind = data?.indicators;
  const blocks = data?.blocks ?? {};

  // Os 12 indicadores da seção 4, cada um abrindo a área já filtrada.
  const TILES = [
    { label: "Disponíveis", value: ind?.available, accent: "green", icon: Package, href: "/ferramentas/inventario?status=available" },
    { label: "Reservadas", value: ind?.reserved, accent: "amber", icon: Bookmark, href: "/ferramentas/inventario?status=reserved" },
    { label: "Separadas", value: ind?.separating, accent: "amber", icon: PackageOpen, href: "/ferramentas/pedidos?status=separating" },
    { label: "Prontas p/ retirada", value: ind?.awaiting_pickup, accent: "cyan", icon: ShoppingBag, href: "/ferramentas/pedidos?status=awaiting_pickup" },
    { label: "Em custódia", value: ind?.in_custody, accent: "blue", icon: User, href: "/ferramentas/custodias" },
    { label: "Devolução solicitada", value: ind?.return_requested, accent: "blue", icon: Undo2, href: "/ferramentas/devolucoes" },
    { label: "Vencem hoje", value: ind?.due_today, accent: "amber", icon: Clock, href: "/ferramentas/custodias?situacao=due_today" },
    { label: "Atrasadas", value: ind?.overdue, accent: "red", icon: AlertTriangle, href: "/ferramentas/custodias?situacao=overdue" },
    { label: "Em manutenção", value: ind?.maintenance, accent: "purple", icon: Wrench, href: "/ferramentas/manutencao" },
    { label: "Danos comunicados", value: ind?.damage_reported, accent: "red", icon: ShieldAlert, href: "/ferramentas/custodias?situacao=damage" },
    { label: "Prorrogações pendentes", value: ind?.extension_pending, accent: "orange", icon: CalendarClock, href: "/ferramentas/custodias?situacao=extension" },
    { label: "Pedidos em análise", value: ind?.pending_requests, accent: "blue", icon: Inbox, href: "/ferramentas/pedidos?status=pending" },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral da operação do almoxarifado.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {TILES.map((t) => (
          <KpiTile
            key={t.label}
            label={t.label}
            value={t.value ?? 0}
            href={t.href}
            icon={t.icon}
            accent={t.accent}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Blocos operacionais */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <RequestBlock
          title="Pedidos aguardando análise"
          href="/ferramentas/pedidos?status=pending"
          rows={blocks.recent_requests ?? []}
          isLoading={isLoading}
        />
        <CustodyBlock
          title="Próximas devoluções"
          href="/ferramentas/custodias"
          rows={blocks.upcoming_returns ?? []}
          isLoading={isLoading}
          dateField="expected_return_at"
        />
        <CustodyBlock
          title="Custódias atrasadas"
          href="/ferramentas/custodias?situacao=overdue"
          rows={blocks.overdue_custody ?? []}
          isLoading={isLoading}
          dateField="expected_return_at"
        />
        <CustodyBlock
          title="Devoluções pendentes"
          href="/ferramentas/devolucoes"
          rows={blocks.pending_returns ?? []}
          isLoading={isLoading}
          dateField="return_requested_at"
        />
        <RequestBlock
          title="Aguardando separação"
          href="/ferramentas/pedidos?status=separating"
          rows={blocks.awaiting_separation ?? []}
          isLoading={isLoading}
        />
        <RequestBlock
          title="Prontas para retirada"
          href="/ferramentas/pedidos?status=awaiting_pickup"
          rows={blocks.ready_for_pickup ?? []}
          isLoading={isLoading}
        />
        <CustodyBlock
          title="Danos comunicados"
          href="/ferramentas/custodias?situacao=damage"
          rows={blocks.reported_damages ?? []}
          isLoading={isLoading}
          dateField="damage_reported_at"
        />
        <EventBlock
          title="Últimas movimentações"
          rows={blocks.latest_events ?? []}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

// ============================================================
// Blocos
// ============================================================

function BlockShell({
  title,
  href,
  isLoading,
  empty,
  children,
}: {
  title: string;
  href?: string;
  isLoading?: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {href && (
          <Link
            href={href}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todos
          </Link>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : empty ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nada por aqui
          </p>
        ) : (
          <div className="space-y-2">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDate(v: unknown): string {
  if (!v || typeof v !== "string") return "—";
  return new Date(v).toLocaleDateString("pt-BR");
}

function RequestBlock({
  title,
  href,
  rows,
  isLoading,
}: {
  title: string;
  href: string;
  rows: Array<Record<string, unknown>>;
  isLoading?: boolean;
}) {
  return (
    <BlockShell title={title} href={href} isLoading={isLoading} empty={rows.length === 0}>
      {rows.map((r) => {
        const requester = r.requester as { full_name?: string } | null;
        return (
          <Link
            key={String(r.id)}
            href={`/ferramentas/pedidos?focus=${String(r.id)}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-secondary/40"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {String(r.quantity ?? 1)}× {String(r.tool_name ?? "Ferramenta")}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {requester?.full_name ?? "—"} · {fmtDate(r.created_at)}
              </p>
            </div>
            <RequestStatusBadge status={String(r.status)} />
          </Link>
        );
      })}
    </BlockShell>
  );
}

function CustodyBlock({
  title,
  href,
  rows,
  isLoading,
  dateField,
}: {
  title: string;
  href: string;
  rows: Array<Record<string, unknown>>;
  isLoading?: boolean;
  dateField: string;
}) {
  return (
    <BlockShell title={title} href={href} isLoading={isLoading} empty={rows.length === 0}>
      {rows.map((c) => {
        const tool = c.tool as { name?: string } | null;
        const unit = c.unit as { code?: string } | null;
        const user = c.user as { full_name?: string } | null;
        const os = c.service_order as { order_number?: string } | null;
        return (
          <Link
            key={String(c.id)}
            href={`/ferramentas/custodias?focus=${String(c.id)}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-secondary/40"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {tool?.name ?? "Ferramenta"}
                {unit?.code && (
                  <span className="ml-1 text-muted-foreground">{unit.code}</span>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user?.full_name ?? "—"}
                {os?.order_number && ` · OS #${os.order_number}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <DeadlineBadge custody={c as never} />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {fmtDate(c[dateField])}
              </p>
            </div>
          </Link>
        );
      })}
    </BlockShell>
  );
}

function EventBlock({
  title,
  rows,
  isLoading,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  isLoading?: boolean;
}) {
  return (
    <BlockShell title={title} isLoading={isLoading} empty={rows.length === 0}>
      {rows.map((e) => {
        const tool = e.tool as { name?: string } | null;
        const unit = e.unit as { id?: string; code?: string } | null;
        const body = (
          <>
            <p className="truncate text-xs font-medium">
              {EVENT_TYPE_LABELS[String(e.event_type)] ?? String(e.event_type)}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {tool?.name ?? "Ferramenta"}
              {unit?.code && ` — ${unit.code}`} ·{" "}
              {new Date(String(e.created_at)).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </>
        );
        return unit?.id ? (
          <Link
            key={String(e.id)}
            href={`/ferramentas/unidades/${unit.id}`}
            className="block rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-secondary/40"
          >
            {body}
          </Link>
        ) : (
          <div key={String(e.id)} className="px-2 py-1.5">
            {body}
          </div>
        );
      })}
    </BlockShell>
  );
}
