"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Package, User, ClipboardList, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toolsApi } from "@/lib/api";
import type { ToolsSearchResult } from "@/lib/api/tools";
import { UnitStatusBadge } from "@/components/ferramentas/almox-badges";

/**
 * Pesquisa global (spec seções 5-7).
 * "A pesquisa deverá reconhecer automaticamente o tipo de informação digitada."
 */
function BuscaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initial = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initial);
  const [result, setResult] = useState<ToolsSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const res = await toolsApi.globalSearch(q.trim());
      setResult(res);
      // Código/patrimônio/série exatos levam direto à ficha da unidade.
      if (res.exact_unit_id) {
        router.push(`/ferramentas/unidades/${res.exact_unit_id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na busca");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (initial) void run(initial);
  }, [initial, run]);

  const r = result?.results;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Pesquisa global</h1>
        <p className="text-sm text-muted-foreground">
          Ferramenta, código, patrimônio, série, técnico, obra ou OS.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
        className="flex gap-2"
      >
        <div className="flex-1">
          <Input
            placeholder="Digite ao menos 2 caracteres..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </form>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !result ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="Faça uma busca"
              description="O sistema identifica sozinho se você digitou um código, um técnico ou uma OS."
            />
          </CardContent>
        </Card>
      ) : result.total === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title={`Nada encontrado para "${result.query}"`}
              description="Tente outro termo."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {r!.units.length > 0 && (
            <Section title="Unidades físicas" icon={Package}>
              {r!.units.map((u) => {
                const tool = u.tool as { name?: string } | null;
                return (
                  <Link
                    key={String(u.id)}
                    href={`/ferramentas/unidades/${String(u.id)}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-secondary/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {tool?.name ?? "Ferramenta"} — {String(u.code)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[u.patrimony_code, u.serial_number, u.location]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <UnitStatusBadge status={String(u.status)} />
                  </Link>
                );
              })}
            </Section>
          )}

          {r!.technicians.length > 0 && (
            <Section title="Técnicos" icon={User}>
              {r!.technicians.map((t) => (
                <Link
                  key={String(t.id)}
                  href={`/ferramentas/custodias?tecnico=${String(t.id)}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-secondary/40"
                >
                  <p className="truncate text-sm font-medium">{String(t.full_name)}</p>
                  <span className="shrink-0 rounded-lg bg-secondary px-2 py-1 text-xs">
                    {String(t.custody_count ?? 0)} em custódia
                  </span>
                </Link>
              ))}
            </Section>
          )}

          {r!.tools.length > 0 && (
            <Section title="Tipos de ferramenta" icon={Wrench}>
              {r!.tools.map((t) => (
                <Link
                  key={String(t.id)}
                  href={`/ferramentas/inventario?search=${encodeURIComponent(String(t.name))}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-secondary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{String(t.name)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[t.category, t.brand, t.model].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.tracking_mode === "controlled"
                      ? "por unidade"
                      : `${String(t.quantity_available ?? 0)} un.`}
                  </span>
                </Link>
              ))}
            </Section>
          )}

          {r!.service_orders.length > 0 && (
            <Section title="Ordens de serviço" icon={ClipboardList}>
              {r!.service_orders.map((o) => (
                <Link
                  key={String(o.id)}
                  href={`/os/${String(o.id)}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-secondary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      OS #{String(o.order_number)} — {String(o.title ?? "")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {String(o.client_name ?? "—")}
                    </p>
                  </div>
                </Link>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">{children}</CardContent>
    </Card>
  );
}

export default function BuscaPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <BuscaContent />
    </Suspense>
  );
}
