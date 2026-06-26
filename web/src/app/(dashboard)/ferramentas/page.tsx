"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Package,
  AlertTriangle,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  Settings,
  XCircle,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ToolStatus,
  ToolCondition,
  type ToolInventory,
  type ToolCustody,
} from "@/lib/types";
import { toolsApi } from "@/lib/api";
import { useApi, usePaginatedApi } from "@/hooks/use-api";

// ============================================================
// Labels & Config
// ============================================================

const TOOL_STATUS_LABELS: Record<ToolStatus, string> = {
  [ToolStatus.AVAILABLE]: "Disponível",
  [ToolStatus.IN_CUSTODY]: "Em Custódia",
  [ToolStatus.MAINTENANCE]: "Manutenção",
  [ToolStatus.RETIRED]: "Aposentada",
};

const TOOL_STATUS_COLORS: Record<
  ToolStatus,
  { bg: string; text: string; dot: string }
> = {
  [ToolStatus.AVAILABLE]: {
    bg: "bg-green-500/10",
    text: "text-green-500",
    dot: "bg-green-500",
  },
  [ToolStatus.IN_CUSTODY]: {
    bg: "bg-blue-500/10",
    text: "text-blue-500",
    dot: "bg-blue-500",
  },
  [ToolStatus.MAINTENANCE]: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-500",
    dot: "bg-yellow-500",
  },
  [ToolStatus.RETIRED]: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    dot: "bg-zinc-400",
  },
};

const TOOL_CONDITION_LABELS: Record<ToolCondition, string> = {
  [ToolCondition.NEW]: "Nova",
  [ToolCondition.GOOD]: "Boa",
  [ToolCondition.FAIR]: "Regular",
  [ToolCondition.POOR]: "Ruim",
  [ToolCondition.DAMAGED]: "Danificada",
};

const TOOL_CONDITION_COLORS: Record<ToolCondition, string> = {
  [ToolCondition.NEW]: "bg-green-500",
  [ToolCondition.GOOD]: "bg-blue-500",
  [ToolCondition.FAIR]: "bg-yellow-500",
  [ToolCondition.POOR]: "bg-orange-500",
  [ToolCondition.DAMAGED]: "bg-red-500",
};

// ============================================================
// Tab Type
// ============================================================

type Tab = "inventario" | "custodia";

// ============================================================
// Status Badge Component
// ============================================================

function StatusBadge({ status }: { status: ToolStatus }) {
  const colors = TOOL_STATUS_COLORS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        colors.bg,
        colors.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
      {TOOL_STATUS_LABELS[status]}
    </span>
  );
}

// ============================================================
// Condition Badge Component
// ============================================================

function ConditionBadge({ condition }: { condition: ToolCondition }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          TOOL_CONDITION_COLORS[condition]
        )}
      />
      {TOOL_CONDITION_LABELS[condition]}
    </span>
  );
}

// ============================================================
// Tool Card Skeleton
// ============================================================

function ToolCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-20 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-28" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Custody Table Skeleton
// ============================================================

function CustodyTableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Ferramentas Page
// ============================================================

interface ToolsMetrics {
  totals: {
    available: number;
    in_custody: number;
    maintenance: number;
    retired: number;
    all: number;
  };
  custody: {
    active_count: number;
    overdue_count: number;
    due_in_7d_count: number;
  };
  requests: {
    pending_count: number;
    approved_count: number;
  };
}

function ToolsMetricsPanel() {
  const [metrics, setMetrics] = useState<ToolsMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ToolsMetrics>("/tools/metrics")
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch(() => {
        if (!cancelled) setMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards: Array<{
    label: string;
    value: number | string;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    bg: string;
  }> = [
    {
      label: "Disponíveis",
      value: metrics?.totals.available ?? 0,
      hint: `de ${metrics?.totals.all ?? 0} total`,
      icon: CheckCircle2,
      accent: "border-t-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "Em custódia",
      value: metrics?.totals.in_custody ?? 0,
      hint:
        metrics && metrics.custody.overdue_count > 0
          ? `${metrics.custody.overdue_count} atrasada${metrics.custody.overdue_count === 1 ? "" : "s"}`
          : metrics?.custody.due_in_7d_count
            ? `${metrics.custody.due_in_7d_count} vence em 7d`
            : "todas no prazo",
      icon: ArrowLeftRight,
      accent: "border-t-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Em manutenção",
      value: metrics?.totals.maintenance ?? 0,
      hint: "indisponível para uso",
      icon: Settings,
      accent: "border-t-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Aposentadas",
      value: metrics?.totals.retired ?? 0,
      hint: "fora de operação",
      icon: XCircle,
      accent: "border-t-zinc-500",
      bg: "bg-zinc-500/10",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.4 }}
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className={cn(
              "group rounded-xl border-t-2 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
              c.accent
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {c.label}
              </p>
              <div className={cn("rounded-lg p-1.5", c.bg)}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">
              {isLoading ? "..." : c.value}
            </p>
            <p className="text-xs text-muted-foreground">{c.hint}</p>
          </div>
        );
      })}
      {metrics && (metrics.requests.pending_count > 0 || metrics.custody.overdue_count > 0) && (
        <a
          href="/ferramentas/solicitacoes"
          className="col-span-2 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm hover:bg-amber-500/10 md:col-span-4"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span>
            {metrics.requests.pending_count > 0 && (
              <>
                <strong>{metrics.requests.pending_count}</strong> requisição
                {metrics.requests.pending_count === 1 ? "" : "ões"} pendente
                {metrics.requests.pending_count === 1 ? "" : "s"} de aprovação
              </>
            )}
            {metrics.requests.pending_count > 0 &&
              metrics.custody.overdue_count > 0 && " · "}
            {metrics.custody.overdue_count > 0 && (
              <>
                <strong>{metrics.custody.overdue_count}</strong> custódia
                {metrics.custody.overdue_count === 1 ? "" : "s"} atrasada
                {metrics.custody.overdue_count === 1 ? "" : "s"}
              </>
            )}
            <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
              → ver fila por prioridade
            </span>
          </span>
        </a>
      )}
    </motion.div>
  );
}

export default function FerramentasPage() {
  const [activeTab, setActiveTab] = useState<Tab>("inventario");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ToolStatus | "all">("all");

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    serial_number: "",
    category: "",
    condition: ToolCondition.GOOD as string,
    purchase_value: "",
    purchase_date: "",
    notes: "",
    photo_url: "",
    quantity_available: "1",
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Inventory tab: paginated tools
  const toolsFetcher = useCallback(
    (page: number, limit: number) => {
      return toolsApi.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
    },
    [debouncedSearch, statusFilter]
  );

  const {
    data: tools,
    meta: toolsMeta,
    isLoading: toolsLoading,
    page: toolsPage,
    setPage: setToolsPage,
    mutate: mutateTools,
  } = usePaginatedApi<ToolInventory>(toolsFetcher, 1, 12, [debouncedSearch, statusFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setToolsPage(1);
  }, [debouncedSearch, statusFilter, setToolsPage]);

  // Custody tab: active custodies
  const {
    data: custodies,
    isLoading: custodiesLoading,
    mutate: mutateCustodies,
  } = useApi<ToolCustody[]>(
    (signal) => toolsApi.getActiveCustodies(),
    []
  );

  const isLoading = activeTab === "inventario" ? toolsLoading : custodiesLoading;
  const totalTools = toolsMeta?.total ?? 0;

  const statusFilterOptions: { value: ToolStatus | "all"; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: ToolStatus.AVAILABLE, label: "Disponível" },
    { value: ToolStatus.IN_CUSTODY, label: "Em Custódia" },
    { value: ToolStatus.MAINTENANCE, label: "Manutenção" },
    { value: ToolStatus.RETIRED, label: "Aposentada" },
  ];

  const handleCheckin = async (custodyId: string) => {
    try {
      await toolsApi.checkin(custodyId, { condition_in: ToolCondition.GOOD });
      toast.success("Devolução registrada com sucesso!");
      mutateCustodies();
      mutateTools();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao registrar devolução");
    }
  };

  const handleCreateTool = async () => {
    if (!createForm.name.trim()) {
      toast.error("Nome da ferramenta é obrigatório");
      return;
    }

    setIsCreating(true);
    try {
      const qty = parseInt(createForm.quantity_available || "1", 10);
      await toolsApi.create({
        name: createForm.name,
        description: createForm.description || null,
        serial_number: createForm.serial_number || null,
        category: createForm.category || null,
        condition: createForm.condition as ToolCondition,
        purchase_value: createForm.purchase_value ? parseFloat(createForm.purchase_value) : null,
        purchase_date: createForm.purchase_date || null,
        notes: createForm.notes || null,
        image_url: createForm.photo_url || null,
        photo_url: createForm.photo_url || null,
        quantity_available: Number.isFinite(qty) && qty >= 0 ? qty : 1,
      } as any);
      toast.success("Ferramenta criada com sucesso!");
      setShowCreateModal(false);
      setCreateForm({ name: "", description: "", serial_number: "", category: "", condition: ToolCondition.GOOD, purchase_value: "", purchase_date: "", notes: "", photo_url: "", quantity_available: "1" });
      mutateTools();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar ferramenta");
    } finally {
      setIsCreating(false);
    }
  };

  const handleUploadPhoto = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem (JPEG, PNG, WebP).");
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const url = await toolsApi.uploadPhoto(file);
      setCreateForm((f) => ({ ...f, photo_url: url }));
      toast.success("Foto enviada");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar foto");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

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
              Ferramentas
            </h1>
            <span className="inline-flex h-7 items-center rounded-lg bg-primary/10 px-2.5 text-sm font-semibold text-primary">
              {toolsLoading ? "..." : totalTools}
            </span>
          </div>
          <p className="text-muted-foreground">
            Gerenciamento do inventário e custódia de ferramentas.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          Nova Ferramenta
        </Button>
      </motion.div>

      {/* KPI cards (Jessica 22/06) */}
      <ToolsMetricsPanel />

      {/* Tab Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="flex gap-1 rounded-xl bg-secondary/50 p-1"
      >
        <button
          onClick={() => setActiveTab("inventario")}
          className={cn(
            "relative flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
            activeTab === "inventario"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {activeTab === "inventario" && (
            <motion.div
              layoutId="activeToolTab"
              className="absolute inset-0 rounded-lg bg-background shadow-sm"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Inventário
          </span>
        </button>
        <button
          onClick={() => setActiveTab("custodia")}
          className={cn(
            "relative flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
            activeTab === "custodia"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {activeTab === "custodia" && (
            <motion.div
              layoutId="activeToolTab"
              className="absolute inset-0 rounded-lg bg-background shadow-sm"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Custódia
            {custodies && custodies.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {custodies.length}
              </span>
            )}
          </span>
        </button>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "inventario" ? (
          <motion.div
            key="inventario"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar ferramenta, serial, categoria..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
                  {statusFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setStatusFilter(option.value)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200",
                        statusFilter === option.value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tools Grid */}
            {toolsLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <ToolCardSkeleton key={i} />
                ))}
              </div>
            ) : !tools || tools.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Card>
                  <CardContent>
                    <EmptyState
                      icon={<Wrench className="h-6 w-6" />}
                      title="Nenhuma ferramenta encontrada"
                      description="Cadastre uma nova ferramenta para começar ou ajuste os filtros de busca."
                      action={
                        <Button onClick={() => setShowCreateModal(true)}>
                          <Plus className="h-4 w-4" />
                          Nova Ferramenta
                        </Button>
                      }
                    />
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {tools.map((tool, index) => (
                  <motion.div
                    key={tool.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                  >
                    <Card
                      hover
                      className="cursor-pointer overflow-hidden"
                    >
                      {/* Top accent line by status */}
                      <div
                        className={cn(
                          "h-[2px]",
                          tool.status === ToolStatus.AVAILABLE &&
                            "bg-green-500",
                          tool.status === ToolStatus.IN_CUSTODY && "bg-blue-500",
                          tool.status === ToolStatus.MAINTENANCE &&
                            "bg-yellow-500",
                          tool.status === ToolStatus.RETIRED && "bg-zinc-400"
                        )}
                      />
                      <CardContent className="p-5">
                        <div className="space-y-3">
                          {/* Photo + Name + Status */}
                          <div className="flex items-start gap-3">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/40 flex items-center justify-center">
                              {(tool.photo_url || tool.image_url) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={(tool.photo_url || tool.image_url) as string}
                                  alt={tool.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Wrench className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="truncate text-sm font-semibold">
                                  {tool.name}
                                </h3>
                                <StatusBadge status={tool.status} />
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {tool.serial_number || "Sem serial"}
                              </p>
                              <p className="mt-1 text-xs">
                                <span className="text-muted-foreground">Disponivel: </span>
                                <span className="font-semibold text-primary">
                                  {tool.quantity_available ?? 1}
                                </span>
                              </p>
                            </div>
                          </div>

                          {/* Category & Condition */}
                          <div className="flex items-center gap-3">
                            {tool.category && (
                              <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {tool.category}
                              </span>
                            )}
                            <ConditionBadge condition={tool.condition} />
                          </div>

                          {/* Description if present */}
                          {tool.description && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {tool.description}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="custodia"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Custody Table */}
            {custodiesLoading ? (
              <CustodyTableSkeleton />
            ) : !custodies || custodies.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Card>
                  <CardContent>
                    <EmptyState
                      icon={<ArrowLeftRight className="h-6 w-6" />}
                      title="Nenhuma custódia ativa"
                      description="Todas as ferramentas estão disponíveis no momento."
                    />
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ArrowLeftRight className="h-5 w-5 text-primary" />
                    Custodias Ativas
                    <span className="ml-1 inline-flex h-5 items-center rounded-md bg-primary/10 px-2 text-xs font-semibold text-primary">
                      {custodies.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Desktop Table */}
                  <div className="hidden lg:block">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Ferramenta
                            </th>
                            <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Técnico
                            </th>
                            <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              OS Vinculada
                            </th>
                            <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Retirada Em
                            </th>
                            <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Condição
                            </th>
                            <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {custodies.map((custody, index) => (
                            <motion.tr
                              key={custody.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                delay: index * 0.05,
                                duration: 0.3,
                              }}
                              className="transition-colors hover:bg-accent/50"
                            >
                              <td className="py-3.5 pr-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                    <Wrench className="h-4 w-4 text-primary" />
                                  </div>
                                  <span className="text-sm font-medium">
                                    {custody.tool_id}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 pr-4 text-sm">
                                {custody.user_id}
                              </td>
                              <td className="py-3.5 pr-4 text-sm">
                                {custody.service_order_id ? (
                                  <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
                                    {custody.service_order_id}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 pr-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  {new Date(
                                    custody.checked_out_at
                                  ).toLocaleDateString("pt-BR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "2-digit",
                                  })}
                                </div>
                              </td>
                              <td className="py-3.5 pr-4">
                                <ConditionBadge
                                  condition={custody.condition_out}
                                />
                              </td>
                              <td className="py-3.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCheckin(custody.id)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Registrar Devolução
                                </Button>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Cards */}
                  <div className="space-y-3 lg:hidden">
                    {custodies.map((custody, index) => (
                      <motion.div
                        key={custody.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        className="rounded-xl border p-4 space-y-3 border-border"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <Wrench className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {custody.tool_id}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {custody.user_id}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">
                              OS:{" "}
                            </span>
                            <span className="font-medium">
                              {custody.service_order_id || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Condição:{" "}
                            </span>
                            <ConditionBadge
                              condition={custody.condition_out}
                            />
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Retirada:{" "}
                            </span>
                            <span>
                              {new Date(
                                custody.checked_out_at
                              ).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleCheckin(custody.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Registrar Devolucao
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* CREATE TOOL MODAL */}
      {/* ============================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Nova Ferramenta</h2>
            <div className="space-y-4">
              {/* Foto */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Foto
                </label>
                <div className="flex items-center gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/40 flex items-center justify-center">
                    {createForm.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={createForm.photo_url}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Wrench className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadPhoto(f);
                      }}
                      className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                      disabled={isUploadingPhoto}
                    />
                    {isUploadingPhoto && (
                      <p className="text-xs text-muted-foreground">Enviando...</p>
                    )}
                    {createForm.photo_url && !isUploadingPhoto && (
                      <button
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, photo_url: "" })}
                        className="text-xs text-destructive hover:underline"
                      >
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <Input
                label="Nome *"
                placeholder="Nome da ferramenta"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Descricao</label>
                <textarea
                  placeholder="Descricao da ferramenta (visivel para tecnicos no catalogo)"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={2}
                  className="flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary transition-all duration-200 resize-none"
                />
              </div>
              <Input
                label="Quantidade disponivel *"
                type="number"
                min="0"
                step="1"
                placeholder="1"
                value={createForm.quantity_available}
                onChange={(e) => setCreateForm({ ...createForm, quantity_available: e.target.value })}
              />
              <Input
                label="Número de Serie"
                placeholder="Serial number"
                value={createForm.serial_number}
                onChange={(e) => setCreateForm({ ...createForm, serial_number: e.target.value })}
              />
              <Input
                label="Categoria"
                placeholder="Ex: Elétrica, Medição..."
                value={createForm.category}
                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
              />
              <SelectNative
                label="Condição"
                value={createForm.condition}
                onChange={(e) => setCreateForm({ ...createForm, condition: e.target.value })}
              >
                <option value={ToolCondition.NEW}>Nova</option>
                <option value={ToolCondition.GOOD}>Boa</option>
                <option value={ToolCondition.FAIR}>Regular</option>
                <option value={ToolCondition.POOR}>Ruim</option>
                <option value={ToolCondition.DAMAGED}>Danificada</option>
              </SelectNative>
              <Input
                label="Valor de Compra (R$)"
                type="number"
                placeholder="0,00"
                min="0"
                step="0.01"
                value={createForm.purchase_value}
                onChange={(e) => setCreateForm({ ...createForm, purchase_value: e.target.value })}
              />
              <Input
                label="Data de Compra"
                type="date"
                value={createForm.purchase_date}
                onChange={(e) => setCreateForm({ ...createForm, purchase_date: e.target.value })}
              />
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Observações</label>
                <textarea
                  placeholder="Observações sobre a ferramenta..."
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  rows={3}
                  className="flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary transition-all duration-200 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
              <Button onClick={handleCreateTool} isLoading={isCreating}>Criar Ferramenta</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
