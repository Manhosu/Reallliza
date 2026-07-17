"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Search,
  UserCheck,
  ClipboardList,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Tela dedicada de consulta das OSs executadas por HOMOLOGADOS.
 * Jessica 17/07:
 *   "As OS dos homologados deverao ser exibidas exclusivamente no
 *    aplicativo do homologado. Na tela principal da Realliza aparecem
 *    apenas as OS da equipe interna. Entretanto o sistema deve manter
 *    rastreabilidade — Realliza tem tela dedicada onde consulta todas
 *    as OSs executadas por homologados."
 *
 * Filtros: busca (titulo/cliente/cidade), status, data.
 * Colunas: numero, titulo, homologado, loja, cliente, status, data.
 * Ao clicar, roteia pra /os/[id] (reusa modal de detalhe).
 */

interface OsRow {
  id: string;
  order_number: number | null;
  title: string;
  status: string;
  client_name: string | null;
  address_city: string | null;
  address_state: string | null;
  created_at: string;
  completed_at: string | null;
  technician: { id: string; full_name: string } | null;
  partner: { id: string; company_name: string } | null;
}

interface PaginatedResp {
  data: OsRow[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "Rascunho", color: "bg-zinc-500/15 text-zinc-500" },
  awaiting_assignment: {
    label: "Aguardando Designação",
    color: "bg-amber-500/15 text-amber-600",
  },
  pending: { label: "Pendente", color: "bg-yellow-500/15 text-yellow-600" },
  assigned: { label: "Atribuída", color: "bg-blue-500/15 text-blue-500" },
  in_progress: {
    label: "Em Andamento",
    color: "bg-blue-500/15 text-blue-500",
  },
  paused: { label: "Pausada", color: "bg-zinc-500/15 text-zinc-500" },
  completed: {
    label: "Concluída",
    color: "bg-emerald-500/15 text-emerald-500",
  },
  invoiced: { label: "Faturada", color: "bg-violet-500/15 text-violet-500" },
  cancelled: { label: "Cancelada", color: "bg-red-500/15 text-red-500" },
  rejected: { label: "Rejeitada", color: "bg-red-500/15 text-red-500" },
};

export default function OsHomologadosPage() {
  const [rows, setRows] = useState<OsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        executor_type: "homologado",
        limit: "100",
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (status !== "all") params.status = status;
      const qs = new URLSearchParams(params).toString();
      const data = await apiClient.get<PaginatedResp>(`/service-orders?${qs}`);
      setRows(data.data ?? []);
    } catch (err) {
      console.error("load OS homologados failed", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <UserCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
              OSs Homologados
            </h1>
            <p className="text-sm text-muted-foreground">
              Consulta e rastreabilidade completa das ordens de serviço
              executadas pela rede homologada. Cada linha abre a OS com
              histórico, etapas e fotos.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, cliente ou cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos os status</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="Nenhuma OS de homologado"
          description="Não há OSs executadas por homologados que correspondam aos filtros."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">#</th>
                    <th className="px-4 py-3 text-left font-medium">Título</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Homologado
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Loja</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Cidade</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Aberta em
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = STATUS_META[r.status] ?? {
                      label: r.status,
                      color: "bg-zinc-500/15 text-zinc-500",
                    };
                    return (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b transition hover:bg-muted/20"
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {r.order_number ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <p className="line-clamp-1 font-medium">{r.title}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.technician?.full_name ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.partner?.company_name ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.client_name ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.address_city && r.address_state
                            ? `${r.address_city}/${r.address_state}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-xs font-medium",
                              st.color
                            )}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/os/${r.id}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Ver <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} OS{rows.length === 1 ? "" : "s"} exibidas · use os filtros
        para refinar a consulta.
      </p>

      {/* Voltar */}
      <div className="pt-2">
        <Link
          href="/os"
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          Voltar para Ordens de Serviço (Reallliza)
        </Link>
      </div>
    </div>
  );
}
