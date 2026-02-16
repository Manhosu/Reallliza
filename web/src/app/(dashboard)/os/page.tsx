"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Calendar,
  User,
  ClipboardList,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  OsStatus,
  OsPriority,
  UserRole,
  OS_STATUS_LABELS,
  OS_PRIORITY_LABELS,
  type ServiceOrder,
} from "@/lib/types";
import { serviceOrdersApi } from "@/lib/api";
import { usePaginatedApi } from "@/hooks/use-api";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

// ============================================================
// Status & Priority Color Maps
// ============================================================

const STATUS_BADGE_VARIANT: Record<OsStatus, string> = {
  [OsStatus.DRAFT]: "gray",
  [OsStatus.PENDING]: "warning",
  [OsStatus.ASSIGNED]: "info",
  [OsStatus.IN_PROGRESS]: "info",
  [OsStatus.PAUSED]: "gray",
  [OsStatus.COMPLETED]: "success",
  [OsStatus.CANCELLED]: "destructive",
  [OsStatus.REJECTED]: "destructive",
};

const PRIORITY_BADGE_VARIANT: Record<OsPriority, string> = {
  [OsPriority.LOW]: "gray",
  [OsPriority.MEDIUM]: "warning",
  [OsPriority.HIGH]: "orange",
  [OsPriority.URGENT]: "destructive",
};

// ============================================================
// Kanban Column Config
// ============================================================

const KANBAN_COLUMNS = [
  { status: OsStatus.PENDING, label: "Abertas", color: "#EAB308" },
  { status: OsStatus.IN_PROGRESS, label: "Em Andamento", color: "#3B82F6" },
  { status: OsStatus.COMPLETED, label: "Concluidas", color: "#22C55E" },
  { status: OsStatus.CANCELLED, label: "Canceladas", color: "#EF4444" },
];

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(val: number | null): string {
  if (val == null) return "-";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ============================================================
// Table Skeleton
// ============================================================

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl p-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-48 flex-1" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Kanban Skeleton
// ============================================================

function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, col) => (
        <div key={col} className="space-y-3">
          <Skeleton className="h-8 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Pagination
// ============================================================

const ITEMS_PER_PAGE = 10;

// ============================================================
// OS Listing Page
// ============================================================

export default function OsListingPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isPartner = user?.role === UserRole.PARTNER;
  const canDragDrop = user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN;
  const [isDragging, setIsDragging] = useState(false);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch service orders with filters using paginated API hook
  const {
    data: orders,
    meta,
    error,
    isLoading,
    page: currentPage,
    setPage: setCurrentPage,
    mutate,
  } = usePaginatedApi<ServiceOrder>(
    useCallback(
      (page: number, limit: number, signal: AbortSignal) => {
        return serviceOrdersApi.list({
          page,
          limit,
          search: debouncedSearch || undefined,
          status: statusFilter !== "all" ? (statusFilter as OsStatus) : undefined,
          priority: priorityFilter !== "all" ? (priorityFilter as OsPriority) : undefined,
        });
      },
      [debouncedSearch, statusFilter, priorityFilter]
    ),
    1,
    ITEMS_PER_PAGE
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, setCurrentPage]);

  const totalItems = meta?.total ?? 0;
  const totalPages = meta?.total_pages ?? 1;

  // Kanban grouped data (uses all fetched orders for the current filter)
  const kanbanData = useMemo(() => {
    if (!orders) return KANBAN_COLUMNS.map((col) => ({ ...col, orders: [] as ServiceOrder[] }));
    return KANBAN_COLUMNS.map((col) => ({
      ...col,
      orders: orders.filter((o) => o.status === col.status),
    }));
  }, [orders]);

  // Drag-and-drop handler
  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, targetStatus: OsStatus) => {
      e.preventDefault();
      e.currentTarget.classList.remove("ring-2", "ring-primary/50");
      const osId = e.dataTransfer.getData("text/plain");
      if (!osId) return;

      // Find the order to check if it's already in this status
      const order = orders?.find((o) => o.id === osId);
      if (!order || order.status === targetStatus) return;

      try {
        await serviceOrdersApi.changeStatus(osId, targetStatus);
        toast.success(
          `OS movida para "${OS_STATUS_LABELS[targetStatus]}" com sucesso!`
        );
        mutate();
      } catch (err: any) {
        toast.error(err?.message || "Erro ao alterar status da OS");
      }
    },
    [orders, mutate]
  );

  // Error display
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
              {isPartner ? "Meus Chamados" : "Ordens de Servico"}
            </h1>
          </div>
          <Button onClick={() => router.push("/os/nova")}>
            <Plus className="h-4 w-4" />
            {isPartner ? "Novo Chamado" : "Nova OS"}
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1 text-center">
              <p className="font-medium text-foreground">
                Erro ao carregar ordens de servico
              </p>
              <p className="text-sm text-muted-foreground">
                {error.message || "Ocorreu um erro inesperado. Tente novamente."}
              </p>
            </div>
            <Button variant="outline" onClick={() => mutate()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {isPartner ? "Meus Chamados" : "Ordens de Servico"}
          </h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : isPartner
              ? `${totalItems} chamado${totalItems !== 1 ? "s" : ""} encontrado${totalItems !== 1 ? "s" : ""}`
              : `${totalItems} ordem${totalItems !== 1 ? "s" : ""} encontrada${totalItems !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => router.push("/os/nova")}>
          <Plus className="h-4 w-4" />
          {isPartner ? "Novo Chamado" : "Nova OS"}
        </Button>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar OS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                      "flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm",
                      "placeholder:text-muted-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                      "focus-visible:border-primary",
                      "transition-all duration-200"
                    )}
                  />
                </div>
              </div>

              <div className="w-full lg:w-48">
                <SelectNative
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Todos os status</option>
                  {Object.values(OsStatus).map((status) => (
                    <option key={status} value={status}>
                      {OS_STATUS_LABELS[status]}
                    </option>
                  ))}
                </SelectNative>
              </div>

              <div className="w-full lg:w-48">
                <SelectNative
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option value="all">Todas prioridades</option>
                  {Object.values(OsPriority).map((priority) => (
                    <option key={priority} value={priority}>
                      {OS_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </SelectNative>
              </div>

              {/* View Toggle */}
              <div className="flex items-center gap-1 rounded-xl border border-input p-1">
                <button
                  onClick={() => setView("table")}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                    view === "table"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("kanban")}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                    view === "kanban"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        view === "table" ? <TableSkeleton /> : <KanbanSkeleton />
      ) : view === "table" ? (
        /* ====== TABLE VIEW ====== */
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
                      #
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Titulo
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Cliente
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Prioridade
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Tecnico
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Data Agendada
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!orders || orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                            <ClipboardList className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              Nenhuma OS encontrada
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Tente alterar os filtros ou crie uma nova ordem de servico.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    orders.map((order, index) => (
                      <motion.tr
                        key={order.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04, duration: 0.3 }}
                        onClick={() => router.push(`/os/${order.id}`)}
                        className="group cursor-pointer transition-colors hover:bg-accent/50"
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm font-semibold text-primary">
                            {order.order_number}
                          </span>
                        </td>
                        <td className="max-w-[240px] px-6 py-4">
                          <p className="truncate text-sm font-medium">
                            {order.title}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-muted-foreground">
                            {order.client_name}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge
                            variant={STATUS_BADGE_VARIANT[order.status] as any}
                          >
                            {OS_STATUS_LABELS[order.status]}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge
                            variant={PRIORITY_BADGE_VARIANT[order.priority] as any}
                            size="sm"
                          >
                            {OS_PRIORITY_LABELS[order.priority]}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-muted-foreground">
                            {order.technician_id || "-"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-muted-foreground">
                            {formatDate(order.scheduled_date)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionMenuId(
                                  actionMenuId === order.id ? null : order.id
                                );
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {actionMenuId === order.id && (
                              <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-xl border bg-popover p-1 shadow-lg">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/os/${order.id}`);
                                    setActionMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                                >
                                  <Eye className="h-4 w-4" />
                                  Ver detalhes
                                </button>
                                {!isPartner && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActionMenuId(null);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                                    >
                                      <Edit className="h-4 w-4" />
                                      Editar
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActionMenuId(null);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Excluir
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-6 py-4">
                <p className="text-sm text-muted-foreground">
                  Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a{" "}
                  {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)}{" "}
                  de {totalItems}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                        currentPage === i + 1
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      ) : (
        /* ====== KANBAN VIEW ====== */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kanbanData.map((column, colIndex) => (
            <motion.div
              key={column.status}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: colIndex * 0.1, duration: 0.4 }}
              className="space-y-3"
              onDragOver={
                canDragDrop
                  ? (e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add("ring-2", "ring-primary/50");
                    }
                  : undefined
              }
              onDragLeave={
                canDragDrop
                  ? (e) => {
                      e.currentTarget.classList.remove("ring-2", "ring-primary/50");
                    }
                  : undefined
              }
              onDrop={
                canDragDrop
                  ? (e) => handleDrop(e, column.status)
                  : undefined
              }
            >
              {/* Column Header */}
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: column.color }}
                />
                <h3 className="text-sm font-semibold">{column.label}</h3>
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                  {column.orders.length}
                </span>
              </div>

              {/* Column Cards */}
              <div className="space-y-3">
                {column.orders.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center">
                    <p className="text-xs text-muted-foreground">
                      Nenhuma OS
                    </p>
                  </div>
                ) : (
                  column.orders.map((order, cardIndex) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: colIndex * 0.1 + cardIndex * 0.05,
                        duration: 0.3,
                      }}
                      draggable={canDragDrop}
                      onDragStart={
                        canDragDrop
                          ? (e: any) => {
                              e.dataTransfer.setData("text/plain", order.id);
                              setIsDragging(true);
                            }
                          : undefined
                      }
                      onDragEnd={
                        canDragDrop
                          ? () => setIsDragging(false)
                          : undefined
                      }
                    >
                      <Card
                        hover
                        className={cn(
                          "cursor-pointer",
                          canDragDrop && "cursor-grab active:cursor-grabbing"
                        )}
                        onClick={() => router.push(`/os/${order.id}`)}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold leading-snug">
                              {order.title}
                            </p>
                            <Badge
                              variant={
                                PRIORITY_BADGE_VARIANT[order.priority] as any
                              }
                              size="sm"
                            >
                              {OS_PRIORITY_LABELS[order.priority]}
                            </Badge>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            {order.client_name}
                          </p>

                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-1.5">
                              {order.technician_id ? (
                                <>
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                                    T
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    Tecnico
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs italic text-muted-foreground">
                                  Sem tecnico
                                </span>
                              )}
                            </div>

                            {order.scheduled_date && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {formatDate(order.scheduled_date)}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
