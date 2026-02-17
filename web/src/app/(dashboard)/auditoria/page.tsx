"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search,
  FileText,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole, type AuditLog } from "@/lib/types";
import { auditApi } from "@/lib/api";
import { usePaginatedApi } from "@/hooks/use-api";

// ============================================================
// Helpers
// ============================================================

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTION_BADGE_VARIANT: Record<string, string> = {
  create: "success",
  update: "info",
  delete: "destructive",
  login: "purple",
  logout: "gray",
  status_change: "warning",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Criar",
  update: "Atualizar",
  delete: "Excluir",
  login: "Login",
  logout: "Logout",
  status_change: "Alteracao Status",
};

const ENTITY_LABELS: Record<string, string> = {
  service_order: "Ordem de Servico",
  user: "Usuario",
  partner: "Parceiro",
  tool: "Ferramenta",
  checklist: "Checklist",
  schedule: "Agenda",
  notification: "Notificacao",
};

// ============================================================
// Skeleton
// ============================================================

function AuditTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28 flex-1" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export default function AuditoriaPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [searchUser, setSearchUser] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Admin-only check
  useEffect(() => {
    if (user && user.role !== UserRole.ADMIN) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const fetcher = useCallback(
    (page: number, limit: number) => {
      return auditApi.search({
        page,
        limit,
        action: actionFilter !== "all" ? actionFilter : undefined,
        entity_type: entityFilter !== "all" ? entityFilter : undefined,
        user_id: searchUser || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
    },
    [actionFilter, entityFilter, searchUser, dateFrom, dateTo]
  );

  const {
    data: logs,
    meta,
    isLoading,
    page,
    setPage,
  } = usePaginatedApi<AuditLog>(fetcher, 1, 20, [actionFilter, entityFilter, searchUser, dateFrom, dateTo]);

  const totalPages = meta?.total_pages ?? 1;
  const totalLogs = meta?.total ?? 0;

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, searchUser, dateFrom, dateTo, setPage]);

  if (user && user.role !== UserRole.ADMIN) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Auditoria
        </h1>
        <p className="text-muted-foreground">
          {isLoading
            ? "Carregando..."
            : `${totalLogs} registro${totalLogs !== 1 ? "s" : ""} encontrado${totalLogs !== 1 ? "s" : ""}`}
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              {/* Date From */}
              <div className="w-full lg:w-44">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Data inicio
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={cn(
                    "flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary transition-all duration-200"
                  )}
                />
              </div>

              {/* Date To */}
              <div className="w-full lg:w-44">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Data fim
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={cn(
                    "flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary transition-all duration-200"
                  )}
                />
              </div>

              {/* Action Filter */}
              <div className="w-full lg:w-48">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Acao
                </label>
                <SelectNative
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="all">Todas as acoes</option>
                  <option value="create">Criar</option>
                  <option value="update">Atualizar</option>
                  <option value="delete">Excluir</option>
                  <option value="login">Login</option>
                  <option value="logout">Logout</option>
                  <option value="status_change">Alteracao Status</option>
                </SelectNative>
              </div>

              {/* Entity Filter */}
              <div className="w-full lg:w-48">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Entidade
                </label>
                <SelectNative
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                >
                  <option value="all">Todas as entidades</option>
                  <option value="service_order">Ordem de Servico</option>
                  <option value="user">Usuario</option>
                  <option value="partner">Parceiro</option>
                  <option value="tool">Ferramenta</option>
                  <option value="checklist">Checklist</option>
                  <option value="schedule">Agenda</option>
                </SelectNative>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      {isLoading ? (
        <AuditTableSkeleton />
      ) : !logs || logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Nenhum registro encontrado"
            description="Tente alterar os filtros de busca."
          />
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Data
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Usuario
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Acao
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Entidade
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Detalhes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log, index) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.3 }}
                      className="group transition-colors hover:bg-accent/50"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="text-sm text-muted-foreground">
                          {formatDateTime(log.created_at)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="text-sm font-medium">
                          {log.user_id
                            ? log.user_id.substring(0, 8) + "..."
                            : "Sistema"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Badge
                          variant={
                            (ACTION_BADGE_VARIANT[log.action] ||
                              "gray") as "success" | "info" | "destructive" | "purple" | "gray" | "warning"
                          }
                        >
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="text-sm text-muted-foreground">
                          {ENTITY_LABELS[log.entity_type] || log.entity_type}
                        </span>
                      </td>
                      <td className="max-w-[300px] px-6 py-4">
                        <span className="text-sm text-muted-foreground truncate block">
                          {log.entity_id
                            ? `ID: ${log.entity_id.substring(0, 12)}...`
                            : "-"}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta && totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-6 py-4">
                <p className="text-sm text-muted-foreground">
                  Pagina {page} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Proximo
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
