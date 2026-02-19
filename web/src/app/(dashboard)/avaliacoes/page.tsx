"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus,
  Star,
  Search,
  UserCheck,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { ratingsApi } from "@/lib/api";
import { usersApi } from "@/lib/api";
import { type ProfessionalRating, type Profile, UserRole } from "@/lib/types";
import { usePaginatedApi } from "@/hooks/use-api";
import { useAuthStore } from "@/stores/auth-store";

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
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

function averageScore(rating: ProfessionalRating): number {
  const total =
    rating.quality_score +
    rating.punctuality_score +
    rating.organization_score +
    rating.communication_score;
  return Math.round((total / 4) * 10) / 10;
}

// ============================================================
// Sub-components
// ============================================================

function ScoreStars({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-32">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              "h-3.5 w-3.5",
              i <= score
                ? "fill-amber-400 text-amber-400"
                : "text-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function ScoreInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm w-40">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className="p-0.5"
          >
            <Star
              className={cn(
                "h-5 w-5 transition-colors",
                i <= value
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted hover:text-amber-200"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Skeleton
// ============================================================

function RatingCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  );
}

// ============================================================
// Page
// ============================================================

export default function AvaliacoesPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Create form state
  const [createForm, setCreateForm] = useState({
    professional_id: "",
    quality_score: 0,
    punctuality_score: 0,
    organization_score: 0,
    communication_score: 0,
    notes: "",
    service_order_id: "",
  });

  // Users for the professional select
  const [users, setUsers] = useState<Profile[]>([]);

  // Admin-only check
  useEffect(() => {
    if (user && user.role !== UserRole.ADMIN) {
      router.push("/dashboard");
    }
  }, [user, router]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch users for the create modal
  useEffect(() => {
    usersApi
      .list({ limit: 100 })
      .then((res) => setUsers(res.data || []))
      .catch(() => {});
  }, []);

  const fetcher = useCallback(
    (page: number, limit: number) => {
      return ratingsApi.list({ page, limit });
    },
    []
  );

  const {
    data: ratings,
    meta,
    isLoading,
    page,
    setPage,
    mutate,
  } = usePaginatedApi<ProfessionalRating>(fetcher, 1, 12, []);

  const totalPages = meta?.total_pages ?? 1;
  const totalRatings = meta?.total ?? 0;

  // Filter ratings locally by search (professional name)
  const filteredRatings = ratings
    ? debouncedSearch
      ? ratings.filter((r) =>
          (r.professional?.full_name || "")
            .toLowerCase()
            .includes(debouncedSearch.toLowerCase())
        )
      : ratings
    : null;

  // ============================================================
  // Handlers
  // ============================================================

  const resetCreateForm = () => {
    setCreateForm({
      professional_id: "",
      quality_score: 0,
      punctuality_score: 0,
      organization_score: 0,
      communication_score: 0,
      notes: "",
      service_order_id: "",
    });
  };

  const handleCreate = async () => {
    if (!createForm.professional_id) {
      toast.error("Selecione um profissional");
      return;
    }
    if (
      createForm.quality_score === 0 ||
      createForm.punctuality_score === 0 ||
      createForm.organization_score === 0 ||
      createForm.communication_score === 0
    ) {
      toast.error("Preencha todas as notas (1 a 5)");
      return;
    }

    setIsCreating(true);
    try {
      await ratingsApi.create({
        professional_id: createForm.professional_id,
        quality_score: createForm.quality_score,
        punctuality_score: createForm.punctuality_score,
        organization_score: createForm.organization_score,
        communication_score: createForm.communication_score,
        notes: createForm.notes || undefined,
        service_order_id: createForm.service_order_id || undefined,
      });
      toast.success("Avaliação criada com sucesso!");
      setShowCreateModal(false);
      resetCreateForm();
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar avaliação");
    } finally {
      setIsCreating(false);
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
            Avaliações Internas
          </h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${totalRatings} avaliação${totalRatings !== 1 ? "ões" : ""} registrada${totalRatings !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          Nova Avaliação
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
            placeholder="Buscar por profissional..."
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

      {/* Ratings Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <RatingCardSkeleton key={i} />
          ))}
        </div>
      ) : !filteredRatings || filteredRatings.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card>
            <CardContent>
              <EmptyState
                icon={<Star className="h-6 w-6" />}
                title="Nenhuma avaliação encontrada"
                description="Crie uma nova avaliação para começar a acompanhar o desempenho dos profissionais."
                action={
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4" />
                    Nova Avaliação
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRatings.map((rating, index) => {
              const avg = averageScore(rating);

              return (
                <motion.div
                  key={rating.id}
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: 0.15 + index * 0.07,
                    duration: 0.4,
                  }}
                >
                  <Card hover className="group relative overflow-hidden">
                    {/* Top accent based on average score */}
                    <div
                      className={cn(
                        "absolute inset-x-0 top-0 h-[2px]",
                        avg >= 4
                          ? "bg-green-500"
                          : avg >= 3
                            ? "bg-amber-500"
                            : "bg-red-500"
                      )}
                    />

                    <CardContent className="p-6 space-y-4">
                      {/* Header */}
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                          {getInitials(
                            rating.professional?.full_name || "??"
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold leading-snug">
                            {rating.professional?.full_name ||
                              "Profissional"}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(rating.created_at)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            avg >= 4
                              ? "success"
                              : avg >= 3
                                ? "warning"
                                : "destructive"
                          }
                          size="sm"
                        >
                          {avg.toFixed(1)}
                        </Badge>
                      </div>

                      {/* Scores */}
                      <div className="space-y-1.5">
                        <ScoreStars
                          score={rating.quality_score}
                          label="Qualidade Técnica"
                        />
                        <ScoreStars
                          score={rating.punctuality_score}
                          label="Pontualidade"
                        />
                        <ScoreStars
                          score={rating.organization_score}
                          label="Organização"
                        />
                        <ScoreStars
                          score={rating.communication_score}
                          label="Comunicação"
                        />
                      </div>

                      {/* Notes */}
                      {rating.notes && (
                        <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                          <div className="flex items-start gap-2">
                            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
                              {rating.notes}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Footer: Rated by + linked OS */}
                      <div className="flex items-center justify-between border-t pt-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserCheck className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[120px]">
                            {rating.rated_by_user?.full_name || "Admin"}
                          </span>
                        </div>
                        {rating.service_order && (
                          <span className="truncate text-xs text-muted-foreground max-w-[140px]">
                            OS: {rating.service_order.title}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Pagination */}
          {meta && totalPages > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <Card>
                <div className="flex items-center justify-between px-6 py-4">
                  <p className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
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
                      Próximo
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* CREATE RATING MODAL */}
      {/* ============================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowCreateModal(false);
              resetCreateForm();
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-lg font-semibold mb-6">Nova Avaliação</h2>

            <div className="space-y-5">
              {/* Professional Select */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Profissional *
                </label>
                <select
                  value={createForm.professional_id}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      professional_id: e.target.value,
                    })
                  }
                  className={cn(
                    "flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200"
                  )}
                >
                  <option value="">Selecione um profissional</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Score Inputs */}
              <div className="space-y-3">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Notas (1 a 5) *
                </label>
                <div className="space-y-2 rounded-lg bg-muted/30 p-4">
                  <ScoreInput
                    value={createForm.quality_score}
                    onChange={(v) =>
                      setCreateForm({ ...createForm, quality_score: v })
                    }
                    label="Qualidade Técnica"
                  />
                  <ScoreInput
                    value={createForm.punctuality_score}
                    onChange={(v) =>
                      setCreateForm({ ...createForm, punctuality_score: v })
                    }
                    label="Pontualidade"
                  />
                  <ScoreInput
                    value={createForm.organization_score}
                    onChange={(v) =>
                      setCreateForm({
                        ...createForm,
                        organization_score: v,
                      })
                    }
                    label="Organização"
                  />
                  <ScoreInput
                    value={createForm.communication_score}
                    onChange={(v) =>
                      setCreateForm({
                        ...createForm,
                        communication_score: v,
                      })
                    }
                    label="Comunicação"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Observações
                </label>
                <textarea
                  placeholder="Observações sobre o desempenho do profissional..."
                  value={createForm.notes}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, notes: e.target.value })
                  }
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

              {/* Service Order ID (optional) */}
              <Input
                label="Ordem de Serviço (opcional)"
                placeholder="ID da OS vinculada"
                value={createForm.service_order_id}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    service_order_id: e.target.value,
                  })
                }
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreate} isLoading={isCreating}>
                Criar Avaliação
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
