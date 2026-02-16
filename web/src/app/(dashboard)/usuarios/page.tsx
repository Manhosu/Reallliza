"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  UserX,
  Eye,
  Users,
  Shield,
  Wrench,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import {
  UserRole,
  UserStatus,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  type Profile,
} from "@/lib/types";
import { usersApi, apiClient } from "@/lib/api";
import { usePaginatedApi } from "@/hooks/use-api";

// ============================================================
// Badge Variant Maps
// ============================================================

const ROLE_BADGE_VARIANT: Record<UserRole, string> = {
  [UserRole.ADMIN]: "purple",
  [UserRole.TECHNICIAN]: "info",
  [UserRole.PARTNER]: "success",
};

const ROLE_ICONS: Record<UserRole, React.ReactNode> = {
  [UserRole.ADMIN]: <Shield className="h-3 w-3" />,
  [UserRole.TECHNICIAN]: <Wrench className="h-3 w-3" />,
  [UserRole.PARTNER]: <Building2 className="h-3 w-3" />,
};

const STATUS_BADGE_VARIANT: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: "success",
  [UserStatus.INACTIVE]: "destructive",
  [UserStatus.SUSPENDED]: "warning",
  [UserStatus.PENDING]: "gray",
};

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

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase();
}

// ============================================================
// Table Skeleton
// ============================================================

function UserTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-36 flex-1" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Users Page
// ============================================================

export default function UsuariosPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState<string | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: UserRole.TECHNICIAN as string,
    password: "",
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    full_name: "",
    phone: "",
    role: "" as string,
    status: "" as string,
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetcher = useCallback(
    (page: number, limit: number) => {
      return usersApi.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        role: roleFilter !== "all" ? (roleFilter as UserRole) : undefined,
        status: statusFilter !== "all" ? (statusFilter as UserStatus) : undefined,
      });
    },
    [debouncedSearch, roleFilter, statusFilter]
  );

  const {
    data: users,
    meta,
    isLoading,
    page,
    setPage,
    mutate,
  } = usePaginatedApi<Profile>(fetcher, 1, 10);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter, setPage]);

  const totalUsers = meta?.total ?? 0;
  const totalPages = meta?.total_pages ?? 1;

  // ============================================================
  // Handlers
  // ============================================================

  const handleCreate = async () => {
    if (!createForm.full_name.trim() || !createForm.email.trim()) {
      toast.error("Nome e e-mail sao obrigatorios");
      return;
    }
    if (!createForm.password || createForm.password.length < 6) {
      toast.error("Senha deve ter no minimo 6 caracteres");
      return;
    }

    setIsCreating(true);
    try {
      await apiClient.post("/auth/register", {
        full_name: createForm.full_name,
        email: createForm.email,
        phone: createForm.phone || null,
        role: createForm.role,
        password: createForm.password,
      });
      toast.success("Usuario criado com sucesso!");
      setShowCreateModal(false);
      setCreateForm({ full_name: "", email: "", phone: "", role: UserRole.TECHNICIAN, password: "" });
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar usuario");
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEdit = (user: Profile) => {
    setEditingUser(user);
    setEditForm({
      full_name: user.full_name,
      phone: user.phone || "",
      role: user.role,
      status: user.status,
    });
    setActionMenuId(null);
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    if (!editForm.full_name.trim()) {
      toast.error("Nome e obrigatorio");
      return;
    }

    setIsUpdating(true);
    try {
      await usersApi.update(editingUser.id, {
        full_name: editForm.full_name,
        phone: editForm.phone || null,
        role: editForm.role as UserRole,
        status: editForm.status as UserStatus,
      });
      toast.success("Usuario atualizado com sucesso!");
      setEditingUser(null);
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar usuario");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleStatus = async (user: Profile) => {
    const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    const actionLabel = newStatus === UserStatus.ACTIVE ? "ativar" : "desativar";

    setIsTogglingStatus(user.id);
    setActionMenuId(null);
    try {
      await usersApi.updateStatus(user.id, newStatus);
      toast.success(`Usuario ${newStatus === UserStatus.ACTIVE ? "ativado" : "desativado"} com sucesso!`);
      mutate();
    } catch (err: any) {
      toast.error(err?.message || `Erro ao ${actionLabel} usuario`);
    } finally {
      setIsTogglingStatus(null);
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
            Usuarios
          </h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${totalUsers} usuario${totalUsers !== 1 ? "s" : ""} encontrado${totalUsers !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          Novo Usuario
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
                    placeholder="Buscar por nome ou e-mail..."
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
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="all">Todos os perfis</option>
                  {Object.values(UserRole).map((role) => (
                    <option key={role} value={role}>
                      {USER_ROLE_LABELS[role]}
                    </option>
                  ))}
                </SelectNative>
              </div>

              <div className="w-full lg:w-48">
                <SelectNative
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Todos os status</option>
                  {Object.values(UserStatus).map((status) => (
                    <option key={status} value={status}>
                      {USER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </SelectNative>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      {isLoading ? (
        <UserTableSkeleton />
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
                      Nome
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      E-mail
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Perfil
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Especialidades
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Data Cadastro
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!users || users.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={<Users className="h-6 w-6" />}
                          title="Nenhum usuario encontrado"
                          description="Cadastre um novo usuario para comecar ou ajuste os filtros de busca."
                          action={
                            <Button onClick={() => setShowCreateModal(true)}>
                              <Plus className="h-4 w-4" />
                              Novo Usuario
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    users.map((user, index) => (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04, duration: 0.3 }}
                        className="group transition-colors hover:bg-accent/50"
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                user.role === UserRole.ADMIN
                                  ? "bg-purple-500/15 text-purple-500"
                                  : user.role === UserRole.TECHNICIAN
                                  ? "bg-blue-500/15 text-blue-500"
                                  : "bg-green-500/15 text-green-500"
                              )}
                            >
                              {getInitials(user.full_name)}
                            </div>
                            <span className="text-sm font-medium">
                              {user.full_name}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-muted-foreground">
                            {user.email}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge
                            variant={ROLE_BADGE_VARIANT[user.role] as any}
                            className="gap-1"
                          >
                            {ROLE_ICONS[user.role]}
                            {USER_ROLE_LABELS[user.role]}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Badge
                            variant={STATUS_BADGE_VARIANT[user.status] as any}
                          >
                            {USER_STATUS_LABELS[user.status]}
                          </Badge>
                        </td>
                        <td className="max-w-[200px] px-6 py-4">
                          {user.specialties && user.specialties.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.specialties.slice(0, 2).map((spec) => (
                                <Badge key={spec} variant="outline" size="sm">
                                  {spec}
                                </Badge>
                              ))}
                              {user.specialties.length > 2 && (
                                <Badge variant="outline" size="sm">
                                  +{user.specialties.length - 2}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-muted-foreground">
                            {formatDate(user.created_at)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="relative">
                            <button
                              onClick={() =>
                                setActionMenuId(
                                  actionMenuId === user.id ? null : user.id
                                )
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {actionMenuId === user.id && (
                              <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-xl border bg-popover p-1 shadow-lg">
                                <button
                                  onClick={() => setActionMenuId(null)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                                >
                                  <Eye className="h-4 w-4" />
                                  Ver detalhes
                                </button>
                                <button
                                  onClick={() => handleOpenEdit(user)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                                >
                                  <Edit className="h-4 w-4" />
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleToggleStatus(user)}
                                  disabled={isTogglingStatus === user.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                                >
                                  <UserX className="h-4 w-4" />
                                  {user.status === UserStatus.ACTIVE
                                    ? "Desativar"
                                    : "Ativar"}
                                </button>
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

      {/* ============================================================ */}
      {/* CREATE USER MODAL */}
      {/* ============================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4">
            <h2 className="text-lg font-semibold mb-4">Novo Usuario</h2>
            <div className="space-y-4">
              <Input
                label="Nome Completo *"
                placeholder="Nome completo do usuario"
                value={createForm.full_name}
                onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
              />
              <Input
                label="E-mail *"
                type="email"
                placeholder="email@exemplo.com"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              />
              <Input
                label="Telefone"
                placeholder="(11) 99999-9999"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              />
              <Input
                label="Senha *"
                type="password"
                placeholder="Minimo 6 caracteres"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
              <SelectNative
                label="Perfil"
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              >
                {Object.values(UserRole).map((role) => (
                  <option key={role} value={role}>
                    {USER_ROLE_LABELS[role]}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} isLoading={isCreating}>
                Criar Usuario
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EDIT USER MODAL */}
      {/* ============================================================ */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingUser(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4">
            <h2 className="text-lg font-semibold mb-4">Editar Usuario</h2>
            <div className="space-y-4">
              <Input
                label="Nome Completo *"
                placeholder="Nome completo"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
              <Input
                label="Telefone"
                placeholder="(11) 99999-9999"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
              <SelectNative
                label="Perfil"
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              >
                {Object.values(UserRole).map((role) => (
                  <option key={role} value={role}>
                    {USER_ROLE_LABELS[role]}
                  </option>
                ))}
              </SelectNative>
              <SelectNative
                label="Status"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                {Object.values(UserStatus).map((status) => (
                  <option key={status} value={status}>
                    {USER_STATUS_LABELS[status]}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} isLoading={isUpdating}>
                Salvar Alteracoes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
