"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Send,
  Building2,
  FileText,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { proposalsApi, serviceOrdersApi, partnersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import {
  type ServiceProposal,
  type ServiceOrder,
  type Partner,
  ProposalStatus,
  PROPOSAL_STATUS_LABELS,
  UserRole,
} from "@/lib/types";
import { usePaginatedApi } from "@/hooks/use-api";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value: number | null): string {
  if (!value) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getStatusBadgeVariant(
  status: ProposalStatus
): "warning" | "success" | "destructive" | "gray" {
  switch (status) {
    case ProposalStatus.PENDING:
      return "warning";
    case ProposalStatus.ACCEPTED:
      return "success";
    case ProposalStatus.REJECTED:
      return "destructive";
    case ProposalStatus.EXPIRED:
      return "gray";
    default:
      return "gray";
  }
}

// ============================================================
// Filter tabs
// ============================================================

const STATUS_FILTERS = [
  { label: "Todas", value: "" },
  { label: "Pendentes", value: ProposalStatus.PENDING },
  { label: "Aceitas", value: ProposalStatus.ACCEPTED },
  { label: "Recusadas", value: ProposalStatus.REJECTED },
  { label: "Expiradas", value: ProposalStatus.EXPIRED },
] as const;

// ============================================================
// Card Skeleton
// ============================================================

function ProposalCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Proposals Page
// ============================================================

export default function PropostasPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;
  const isPartner = user?.role === UserRole.PARTNER;

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState({
    service_order_id: "",
    partner_id: "",
    proposed_value: "",
    message: "",
    expires_at: "",
  });

  // Select options for the create modal
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  // Responding state
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Fetcher with status filter
  const fetcher = useCallback(
    (page: number, limit: number) => {
      return proposalsApi.list({
        page,
        limit,
        status: statusFilter || undefined,
      });
    },
    [statusFilter]
  );

  const {
    data: proposals,
    meta,
    isLoading,
    page,
    setPage,
    mutate,
  } = usePaginatedApi<ServiceProposal>(fetcher, 1, 12, [statusFilter]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, setPage]);

  const totalProposals = meta?.total ?? 0;

  // Load service orders and partners for create modal
  useEffect(() => {
    if (!showCreateModal) return;

    let cancelled = false;
    setIsLoadingOptions(true);

    Promise.all([
      serviceOrdersApi.list({ page: 1, limit: 100 }),
      partnersApi.list({ page: 1, limit: 100 }),
    ])
      .then(([osRes, partnerRes]) => {
        if (!cancelled) {
          setServiceOrders(osRes.data ?? []);
          setPartners(partnerRes.data ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Erro ao carregar dados para o formulario");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showCreateModal]);

  // ============================================================
  // Handlers
  // ============================================================

  const handleCreate = async () => {
    if (!createForm.service_order_id || !createForm.partner_id) {
      toast.error("Ordem de servico e parceiro sao obrigatorios");
      return;
    }

    setIsCreating(true);
    try {
      await proposalsApi.create({
        service_order_id: createForm.service_order_id,
        partner_id: createForm.partner_id,
        proposed_value: createForm.proposed_value
          ? Number(createForm.proposed_value)
          : undefined,
        message: createForm.message || undefined,
        expires_at: createForm.expires_at || undefined,
      });
      toast.success("Proposta criada com sucesso!");
      setShowCreateModal(false);
      setCreateForm({
        service_order_id: "",
        partner_id: "",
        proposed_value: "",
        message: "",
        expires_at: "",
      });
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar proposta");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRespond = async (id: string, action: "accept" | "reject") => {
    setRespondingId(id);
    try {
      await proposalsApi.respond(id, { action });
      toast.success(
        action === "accept" ? "Proposta aceita!" : "Proposta recusada"
      );
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao responder proposta");
    } finally {
      setRespondingId(null);
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
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Propostas de Servico
          </h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${totalProposals} proposta${totalProposals !== 1 ? "s" : ""} encontrada${totalProposals !== 1 ? "s" : ""}`}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Nova Proposta
          </Button>
        )}
      </motion.div>

      {/* Filter Pills */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="flex flex-wrap gap-2"
      >
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
              statusFilter === filter.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            {filter.label}
          </button>
        ))}
      </motion.div>

      {/* Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProposalCardSkeleton key={i} />
          ))}
        </div>
      ) : !proposals || proposals.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card>
            <CardContent>
              <EmptyState
                icon={<Send className="h-6 w-6" />}
                title="Nenhuma proposta encontrada"
                description={
                  statusFilter
                    ? "Nenhuma proposta com este filtro. Tente alterar o filtro."
                    : "Crie uma nova proposta para enviar a um parceiro."
                }
                action={
                  isAdmin ? (
                    <Button onClick={() => setShowCreateModal(true)}>
                      <Plus className="h-4 w-4" />
                      Nova Proposta
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {proposals.map((proposal, index) => (
              <motion.div
                key={proposal.id}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.15 + index * 0.07, duration: 0.4 }}
              >
                <Card hover className="group relative overflow-hidden">
                  {/* Top accent based on status */}
                  <div
                    className={cn(
                      "absolute inset-x-0 top-0 h-[2px]",
                      proposal.status === ProposalStatus.PENDING &&
                        "bg-yellow-500",
                      proposal.status === ProposalStatus.ACCEPTED &&
                        "bg-green-500",
                      proposal.status === ProposalStatus.REJECTED &&
                        "bg-red-500",
                      proposal.status === ProposalStatus.EXPIRED &&
                        "bg-zinc-500"
                    )}
                  />

                  <CardContent className="p-6 space-y-4">
                    {/* Header: OS title + Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <h3 className="truncate text-sm font-semibold leading-snug">
                            {proposal.service_order?.title || "Ordem de Servico"}
                          </h3>
                        </div>
                        {proposal.service_order?.client_name && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground pl-6">
                            {proposal.service_order.client_name}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={getStatusBadgeVariant(proposal.status)}
                        size="sm"
                      >
                        {PROPOSAL_STATUS_LABELS[proposal.status]}
                      </Badge>
                    </div>

                    {/* Partner company */}
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="truncate text-muted-foreground">
                        {proposal.partner?.company_name || "Parceiro"}
                      </span>
                    </div>

                    {/* Proposed Value */}
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(proposal.proposed_value)}
                      </span>
                    </div>

                    {/* Message */}
                    {proposal.message && (
                      <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {proposal.message}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Response Message */}
                    {proposal.response_message && (
                      <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                          <div>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-primary/70">
                              Resposta
                            </span>
                            <p className="text-xs leading-relaxed text-foreground/80">
                              {proposal.response_message}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dates */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        <span>Criada em {formatDate(proposal.created_at)}</span>
                      </div>
                      {proposal.responded_at && (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>
                            Respondida em {formatDateTime(proposal.responded_at)}
                          </span>
                        </div>
                      )}
                      {proposal.expires_at && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          <span>
                            Expira em {formatDate(proposal.expires_at)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons for partners when pending */}
                    {isPartner &&
                      proposal.status === ProposalStatus.PENDING && (
                        <div className="flex items-center gap-2 border-t pt-4">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 dark:border-green-800 dark:hover:bg-green-950"
                            onClick={() =>
                              handleRespond(proposal.id, "accept")
                            }
                            disabled={respondingId === proposal.id}
                            isLoading={respondingId === proposal.id}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Aceitar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950"
                            onClick={() =>
                              handleRespond(proposal.id, "reject")
                            }
                            disabled={respondingId === proposal.id}
                            isLoading={respondingId === proposal.id}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Recusar
                          </Button>
                        </div>
                      )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {meta && meta.total_pages > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex items-center justify-center gap-2 pt-4"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {page} de {meta.total_pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.total_pages}
                onClick={() => setPage(page + 1)}
              >
                Proxima
              </Button>
            </motion.div>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* CREATE PROPOSAL MODAL */}
      {/* ============================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Nova Proposta</h2>

            {isLoadingOptions ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Service Order Select */}
                <div className="w-full space-y-2">
                  <label className="text-sm font-medium leading-none text-foreground/80">
                    Ordem de Servico *
                  </label>
                  <select
                    value={createForm.service_order_id}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        service_order_id: e.target.value,
                      })
                    }
                    className={cn(
                      "flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                      "focus-visible:border-primary",
                      "transition-all duration-200"
                    )}
                  >
                    <option value="">Selecione uma OS...</option>
                    {serviceOrders.map((os) => (
                      <option key={os.id} value={os.id}>
                        {os.order_number} - {os.title} ({os.client_name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Partner Select */}
                <div className="w-full space-y-2">
                  <label className="text-sm font-medium leading-none text-foreground/80">
                    Parceiro *
                  </label>
                  <select
                    value={createForm.partner_id}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        partner_id: e.target.value,
                      })
                    }
                    className={cn(
                      "flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                      "focus-visible:border-primary",
                      "transition-all duration-200"
                    )}
                  >
                    <option value="">Selecione um parceiro...</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.company_name}
                        {partner.trading_name
                          ? ` (${partner.trading_name})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Proposed Value */}
                <Input
                  label="Valor Proposto (R$)"
                  type="number"
                  placeholder="0,00"
                  min="0"
                  step="0.01"
                  value={createForm.proposed_value}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      proposed_value: e.target.value,
                    })
                  }
                />

                {/* Message */}
                <div className="w-full space-y-2">
                  <label className="text-sm font-medium leading-none text-foreground/80">
                    Mensagem
                  </label>
                  <textarea
                    placeholder="Descreva os detalhes da proposta..."
                    value={createForm.message}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, message: e.target.value })
                    }
                    rows={4}
                    className={cn(
                      "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                      "placeholder:text-muted-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                      "focus-visible:border-primary",
                      "transition-all duration-200 resize-none"
                    )}
                  />
                </div>

                {/* Expiration Date */}
                <Input
                  label="Data de Expiracao"
                  type="date"
                  value={createForm.expires_at}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      expires_at: e.target.value,
                    })
                  }
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                isLoading={isCreating}
                disabled={isLoadingOptions}
              >
                <Send className="h-4 w-4" />
                Enviar Proposta
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
