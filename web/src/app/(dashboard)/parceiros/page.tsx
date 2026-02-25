"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  ExternalLink,
  Edit,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { UserRole, type Partner } from "@/lib/types";
import { partnersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { usePaginatedApi } from "@/hooks/use-api";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getCompanyInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

function getAddressString(address: unknown): string {
  if (!address) return "";
  if (typeof address === "string") return address;
  if (typeof address === "object" && address !== null) {
    const addr = address as Record<string, unknown>;
    return (addr.full_address as string) || JSON.stringify(address);
  }
  return String(address);
}

// ============================================================
// Card Skeleton
// ============================================================

function PartnerCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Partners Page
// ============================================================

export default function ParceirosPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Admin-only check
  useEffect(() => {
    if (user && user.role !== UserRole.ADMIN) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState<string | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({
    company_name: "",
    trading_name: "",
    cnpj: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    notes: "",
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    company_name: "",
    trading_name: "",
    cnpj: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    notes: "",
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetcher = useCallback(
    (page: number, limit: number) => {
      return partnersApi.list({
        page,
        limit,
        search: debouncedSearch || undefined,
      });
    },
    [debouncedSearch]
  );

  const {
    data: partners,
    meta,
    isLoading,
    page,
    setPage,
    mutate,
  } = usePaginatedApi<Partner>(fetcher, 1, 12, [debouncedSearch]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, setPage]);

  const totalPartners = meta?.total ?? 0;

  // ============================================================
  // Handlers
  // ============================================================

  const handleCreate = async () => {
    if (!createForm.company_name.trim() || !createForm.contact_name.trim()) {
      toast.error("Razão social e nome do contato são obrigatórios");
      return;
    }

    setIsCreating(true);
    try {
      await partnersApi.create({
        company_name: createForm.company_name,
        trading_name: createForm.trading_name || null,
        cnpj: createForm.cnpj || null,
        contact_name: createForm.contact_name,
        contact_email: createForm.contact_email || null,
        contact_phone: createForm.contact_phone || null,
        address: createForm.address || null,
        notes: createForm.notes || null,
      });
      toast.success("Parceiro criado com sucesso!");
      setShowCreateModal(false);
      setCreateForm({ company_name: "", trading_name: "", cnpj: "", contact_name: "", contact_email: "", contact_phone: "", address: "", notes: "" });
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar parceiro");
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEdit = (partner: Partner) => {
    setEditingPartner(partner);
    setEditForm({
      company_name: partner.company_name,
      trading_name: partner.trading_name || "",
      cnpj: partner.cnpj || "",
      contact_name: partner.contact_name,
      contact_email: partner.contact_email || "",
      contact_phone: partner.contact_phone || "",
      address: getAddressString(partner.address),
      notes: partner.notes || "",
    });
  };

  const handleUpdate = async () => {
    if (!editingPartner) return;
    if (!editForm.company_name.trim() || !editForm.contact_name.trim()) {
      toast.error("Razão social e nome do contato são obrigatórios");
      return;
    }

    setIsUpdating(true);
    try {
      await partnersApi.update(editingPartner.id, {
        company_name: editForm.company_name,
        trading_name: editForm.trading_name || null,
        cnpj: editForm.cnpj || null,
        contact_name: editForm.contact_name,
        contact_email: editForm.contact_email || null,
        contact_phone: editForm.contact_phone || null,
        address: editForm.address || null,
        notes: editForm.notes || null,
      });
      toast.success("Parceiro atualizado com sucesso!");
      setEditingPartner(null);
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar parceiro");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleActive = async (partner: Partner) => {
    setIsTogglingActive(partner.id);
    try {
      if (partner.is_active) {
        await partnersApi.deactivate(partner.id);
        toast.success("Parceiro desativado com sucesso!");
      } else {
        await partnersApi.activate(partner.id);
        toast.success("Parceiro ativado com sucesso!");
      }
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao alterar status do parceiro");
    } finally {
      setIsTogglingActive(null);
    }
  };

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
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Parceiros
          </h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${totalPartners} parceiro${totalPartners !== 1 ? "s" : ""} encontrado${totalPartners !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          Novo Parceiro
        </Button>
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar parceiro..."
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
      </motion.div>

      {/* Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <PartnerCardSkeleton key={i} />
          ))}
        </div>
      ) : !partners || partners.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card>
            <CardContent>
              <EmptyState
                icon={<Building2 className="h-6 w-6" />}
                title="Nenhum parceiro encontrado"
                description="Cadastre um novo parceiro para começar ou ajuste a busca."
                action={
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4" />
                    Novo Parceiro
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {partners.map((partner, index) => (
            <motion.div
              key={partner.id}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.15 + index * 0.07, duration: 0.4 }}
            >
              <Card hover className="group relative overflow-hidden">
                {/* Top accent */}
                <div
                  className={cn(
                    "absolute inset-x-0 top-0 h-[2px]",
                    partner.is_active ? "bg-green-500" : "bg-zinc-500"
                  )}
                />

                <CardContent className="p-6 space-y-5">
                  {/* Header */}
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                        partner.is_active
                          ? "bg-green-500/15 text-green-500"
                          : "bg-zinc-500/15 text-zinc-500"
                      )}
                    >
                      {getCompanyInitials(partner.company_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold leading-snug">
                        {partner.company_name}
                      </h3>
                      {partner.trading_name && (
                        <p className="truncate text-xs text-muted-foreground">
                          {partner.trading_name}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={partner.is_active ? "success" : "gray"}
                      size="sm"
                    >
                      {partner.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  {/* CNPJ */}
                  {partner.cnpj && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono">{partner.cnpj}</span>
                    </div>
                  )}

                  {/* Contact Info */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="truncate">{partner.contact_name}</span>
                    </div>

                    {partner.contact_phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                          <Phone className="h-3.5 w-3.5" />
                        </div>
                        <span>{partner.contact_phone}</span>
                      </div>
                    )}

                    {partner.contact_email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                          <Mail className="h-3.5 w-3.5" />
                        </div>
                        <span className="truncate">{partner.contact_email}</span>
                      </div>
                    )}

                    {partner.address && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <span className="leading-snug">{getAddressString(partner.address)}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {partner.notes && (
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {partner.notes}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between border-t pt-4">
                    <span className="text-xs text-muted-foreground">
                      Desde {formatDate(partner.created_at)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(partner)}
                        className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                      >
                        <Edit className="h-3 w-3" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggleActive(partner)}
                        disabled={isTogglingActive === partner.id}
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50",
                          partner.is_active
                            ? "text-destructive hover:text-destructive/80"
                            : "text-green-600 hover:text-green-500"
                        )}
                      >
                        {partner.is_active ? (
                          <>
                            <Ban className="h-3 w-3" />
                            Desativar
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Ativar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* CREATE PARTNER MODAL */}
      {/* ============================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Novo Parceiro</h2>
            <div className="space-y-4">
              <Input
                label="Razão Social *"
                placeholder="Razão social da empresa"
                value={createForm.company_name}
                onChange={(e) => setCreateForm({ ...createForm, company_name: e.target.value })}
              />
              <Input
                label="Nome Fantasia"
                placeholder="Nome fantasia"
                value={createForm.trading_name}
                onChange={(e) => setCreateForm({ ...createForm, trading_name: e.target.value })}
              />
              <Input
                label="CNPJ"
                placeholder="00.000.000/0001-00"
                value={createForm.cnpj}
                onChange={(e) => setCreateForm({ ...createForm, cnpj: e.target.value })}
              />
              <Input
                label="Nome Contato *"
                placeholder="Nome do contato principal"
                value={createForm.contact_name}
                onChange={(e) => setCreateForm({ ...createForm, contact_name: e.target.value })}
              />
              <Input
                label="E-mail Contato"
                type="email"
                placeholder="contato@empresa.com"
                value={createForm.contact_email}
                onChange={(e) => setCreateForm({ ...createForm, contact_email: e.target.value })}
              />
              <Input
                label="Telefone Contato"
                placeholder="(11) 99999-9999"
                value={createForm.contact_phone}
                onChange={(e) => setCreateForm({ ...createForm, contact_phone: e.target.value })}
              />
              <Input
                label="Endereço"
                placeholder="Endereço completo"
                value={createForm.address}
                onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
              />
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Observações</label>
                <textarea
                  placeholder="Observações sobre o parceiro..."
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  rows={3}
                  className={cn(
                    "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200 resize-none"
                  )}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
              <Button onClick={handleCreate} isLoading={isCreating}>Criar Parceiro</Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EDIT PARTNER MODAL */}
      {/* ============================================================ */}
      {editingPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingPartner(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Editar Parceiro</h2>
            <div className="space-y-4">
              <Input
                label="Razão Social *"
                placeholder="Razão social da empresa"
                value={editForm.company_name}
                onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
              />
              <Input
                label="Nome Fantasia"
                placeholder="Nome fantasia"
                value={editForm.trading_name}
                onChange={(e) => setEditForm({ ...editForm, trading_name: e.target.value })}
              />
              <Input
                label="CNPJ"
                placeholder="00.000.000/0001-00"
                value={editForm.cnpj}
                onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })}
              />
              <Input
                label="Nome Contato *"
                placeholder="Nome do contato principal"
                value={editForm.contact_name}
                onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })}
              />
              <Input
                label="E-mail Contato"
                type="email"
                placeholder="contato@empresa.com"
                value={editForm.contact_email}
                onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
              />
              <Input
                label="Telefone Contato"
                placeholder="(11) 99999-9999"
                value={editForm.contact_phone}
                onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
              />
              <Input
                label="Endereço"
                placeholder="Endereço completo"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Observações</label>
                <textarea
                  placeholder="Observações sobre o parceiro..."
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className={cn(
                    "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200 resize-none"
                  )}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setEditingPartner(null)}>Cancelar</Button>
              <Button onClick={handleUpdate} isLoading={isUpdating}>Salvar Alterações</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
