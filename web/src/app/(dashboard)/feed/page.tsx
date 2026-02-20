"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Megaphone,
  Pin,
  Users,
  Edit,
  Trash2,
  Calendar,
  Paperclip,
  X,
  Film,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { feedApi } from "@/lib/api";
import { getAccessToken, BASE_URL } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";
import {
  type FeedPost,
  FeedAudience,
  FEED_AUDIENCE_LABELS,
  UserRole,
} from "@/lib/types";
import { usePaginatedApi } from "@/hooks/use-api";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getAuthorInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".avi", ".mkv"];

function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return VIDEO_EXTENSIONS.some((ext) => url.toLowerCase().includes(ext));
  }
}

const AUDIENCE_BADGE_VARIANT: Record<
  FeedAudience,
  "info" | "purple" | "orange"
> = {
  [FeedAudience.ALL]: "info",
  [FeedAudience.EMPLOYEES]: "purple",
  [FeedAudience.PARTNERS]: "orange",
};

// ============================================================
// Card Skeleton
// ============================================================

function FeedCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Feed Page
// ============================================================

export default function FeedPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === UserRole.ADMIN;

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({
    title: "",
    content: "",
    audience: FeedAudience.ALL as string,
    is_pinned: false,
  });
  const [createMediaUrls, setCreateMediaUrls] = useState<string[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({
    title: "",
    content: "",
    audience: FeedAudience.ALL as string,
    is_pinned: false,
  });
  const [editMediaUrls, setEditMediaUrls] = useState<string[]>([]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetcher = useCallback(
    (page: number, limit: number) => {
      return feedApi.list({ page, limit });
    },
    []
  );

  const {
    data: posts,
    meta,
    isLoading,
    page,
    setPage,
    mutate,
  } = usePaginatedApi<FeedPost>(fetcher, 1, 10, []);

  const totalPosts = meta?.total ?? 0;

  // Client-side search filter
  const filteredPosts =
    posts && debouncedSearch
      ? posts.filter(
          (p) =>
            p.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            p.content.toLowerCase().includes(debouncedSearch.toLowerCase())
        )
      : posts;

  // ============================================================
  // Handlers
  // ============================================================

  const uploadMediaFile = async (file: File): Promise<string | null> => {
    try {
      const token = await getAccessToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${BASE_URL}/feed/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, string>).message || "Erro no upload");
      }

      const data = (await res.json()) as { url: string };
      return data.url;
    } catch (err: any) {
      toast.error(err?.message || "Erro ao fazer upload do arquivo");
      return null;
    }
  };

  const handleMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "create" | "edit"
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingMedia(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const url = await uploadMediaFile(file);
      if (url) newUrls.push(url);
    }

    if (target === "create") {
      setCreateMediaUrls((prev) => [...prev, ...newUrls]);
    } else {
      setEditMediaUrls((prev) => [...prev, ...newUrls]);
    }
    setIsUploadingMedia(false);

    // Reset file input
    e.target.value = "";
  };

  const handleCreate = async () => {
    if (!createForm.title.trim() || !createForm.content.trim()) {
      toast.error("Titulo e conteudo sao obrigatorios");
      return;
    }

    setIsCreating(true);
    try {
      await feedApi.create({
        title: createForm.title,
        content: createForm.content,
        audience: createForm.audience,
        is_pinned: createForm.is_pinned,
        media_urls: createMediaUrls.length > 0 ? createMediaUrls : undefined,
      });
      toast.success("Publicacao criada com sucesso!");
      setShowCreateModal(false);
      setCreateForm({
        title: "",
        content: "",
        audience: FeedAudience.ALL,
        is_pinned: false,
      });
      setCreateMediaUrls([]);
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar publicacao");
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEdit = (post: FeedPost) => {
    setEditingPost(post);
    setEditForm({
      title: post.title,
      content: post.content,
      audience: post.audience,
      is_pinned: post.is_pinned,
    });
    setEditMediaUrls(post.media_urls || []);
  };

  const handleUpdate = async () => {
    if (!editingPost) return;
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast.error("Titulo e conteudo sao obrigatorios");
      return;
    }

    setIsUpdating(true);
    try {
      await feedApi.update(editingPost.id, {
        title: editForm.title,
        content: editForm.content,
        audience: editForm.audience as FeedAudience,
        is_pinned: editForm.is_pinned,
        media_urls: editMediaUrls.length > 0 ? editMediaUrls : [],
      });
      toast.success("Publicacao atualizada com sucesso!");
      setEditingPost(null);
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar publicacao");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (post: FeedPost) => {
    if (!confirm("Tem certeza que deseja excluir esta publicacao?")) return;

    setDeletingId(post.id);
    try {
      await feedApi.delete(post.id);
      toast.success("Publicacao excluida com sucesso!");
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir publicacao");
    } finally {
      setDeletingId(null);
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
            Feed Corporativo
          </h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${totalPosts} ${totalPosts === 1 ? "publicacao" : "publicacoes"}`}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Nova Publicacao
          </Button>
        )}
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
            placeholder="Buscar publicacao..."
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

      {/* Feed Cards */}
      {isLoading ? (
        <div className="space-y-4 max-w-3xl">
          {Array.from({ length: 3 }).map((_, i) => (
            <FeedCardSkeleton key={i} />
          ))}
        </div>
      ) : !filteredPosts || filteredPosts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card>
            <CardContent>
              <EmptyState
                icon={<Megaphone className="h-6 w-6" />}
                title="Nenhuma publicacao encontrada"
                description={
                  isAdmin
                    ? "Crie a primeira publicacao para o feed corporativo."
                    : "Nenhuma publicacao disponivel no momento."
                }
                action={
                  isAdmin ? (
                    <Button onClick={() => setShowCreateModal(true)}>
                      <Plus className="h-4 w-4" />
                      Nova Publicacao
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {filteredPosts.map((post, index) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.15 + index * 0.07, duration: 0.4 }}
            >
              <Card hover className="group relative overflow-hidden">
                {/* Pinned accent */}
                {post.is_pinned && (
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-amber-500" />
                )}

                <CardContent className="p-6 space-y-4">
                  {/* Author row */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-bold">
                      {post.author
                        ? getAuthorInitials(post.author.full_name)
                        : "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug truncate">
                        {post.author?.full_name ?? "Autor desconhecido"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>{formatDate(post.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {post.is_pinned && (
                        <div
                          className="flex items-center gap-1 text-amber-500"
                          title="Fixado"
                        >
                          <Pin className="h-4 w-4" />
                        </div>
                      )}
                      <Badge
                        variant={AUDIENCE_BADGE_VARIANT[post.audience]}
                        size="sm"
                      >
                        <Users className="h-3 w-3 mr-1" />
                        {FEED_AUDIENCE_LABELS[post.audience]}
                      </Badge>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold leading-snug">
                    {post.title}
                  </h3>

                  {/* Content */}
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {post.content}
                  </p>

                  {/* Media thumbnails */}
                  {post.media_urls && post.media_urls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {post.media_urls.map((url, i) =>
                        isVideoUrl(url) ? (
                          <div
                            key={i}
                            className="relative overflow-hidden rounded-lg border border-border"
                          >
                            <video
                              src={url}
                              controls
                              preload="metadata"
                              className="max-h-60 max-w-full rounded-lg"
                            />
                          </div>
                        ) : (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-lg border border-border hover:border-primary transition-colors"
                          >
                            <img
                              src={url}
                              alt={`Midia ${i + 1}`}
                              className="h-20 w-20 object-cover"
                            />
                          </a>
                        )
                      )}
                    </div>
                  )}

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-3 border-t pt-4">
                      <button
                        onClick={() => handleOpenEdit(post)}
                        className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                      >
                        <Edit className="h-3 w-3" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(post)}
                        disabled={deletingId === post.id}
                        className="flex items-center gap-1 text-xs font-medium text-destructive transition-colors hover:text-destructive/80 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Excluir
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}

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
        </div>
      )}

      {/* ============================================================ */}
      {/* CREATE POST MODAL */}
      {/* ============================================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Nova Publicacao</h2>
            <div className="space-y-4">
              {/* Title */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Titulo *
                </label>
                <input
                  type="text"
                  placeholder="Titulo da publicacao"
                  value={createForm.title}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, title: e.target.value })
                  }
                  className={cn(
                    "flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200"
                  )}
                />
              </div>

              {/* Content */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Conteudo *
                </label>
                <textarea
                  placeholder="Escreva o conteudo da publicacao..."
                  value={createForm.content}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, content: e.target.value })
                  }
                  rows={5}
                  className={cn(
                    "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200 resize-none"
                  )}
                />
              </div>

              {/* Audience */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Publico-alvo
                </label>
                <select
                  value={createForm.audience}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, audience: e.target.value })
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200"
                >
                  <option value={FeedAudience.ALL}>
                    {FEED_AUDIENCE_LABELS[FeedAudience.ALL]}
                  </option>
                  <option value={FeedAudience.EMPLOYEES}>
                    {FEED_AUDIENCE_LABELS[FeedAudience.EMPLOYEES]}
                  </option>
                  <option value={FeedAudience.PARTNERS}>
                    {FEED_AUDIENCE_LABELS[FeedAudience.PARTNERS]}
                  </option>
                </select>
              </div>

              {/* Media upload */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Midia (imagens ou videos)
                </label>
                <div className="flex items-center gap-2">
                  <label className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-input cursor-pointer text-sm text-muted-foreground",
                    "hover:border-primary hover:text-foreground transition-colors",
                    isUploadingMedia && "opacity-50 pointer-events-none"
                  )}>
                    {isUploadingMedia ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                    {isUploadingMedia ? "Enviando..." : "Anexar arquivo"}
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/webm,video/quicktime"
                      multiple
                      onChange={(e) => handleMediaUpload(e, "create")}
                      className="hidden"
                    />
                  </label>
                </div>
                {createMediaUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {createMediaUrls.map((url, i) => (
                      <div key={i} className="relative group">
                        {isVideoUrl(url) ? (
                          <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center border">
                            <Film className="h-6 w-6 text-muted-foreground" />
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt={`Midia ${i + 1}`}
                            className="h-16 w-16 object-cover rounded-lg border"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setCreateMediaUrls((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pinned toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={createForm.is_pinned}
                  onClick={() =>
                    setCreateForm({
                      ...createForm,
                      is_pinned: !createForm.is_pinned,
                    })
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                    createForm.is_pinned ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
                      createForm.is_pinned ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
                <div className="flex items-center gap-1.5">
                  <Pin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground/80">
                    Fixar no topo
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreate} isLoading={isCreating} disabled={isUploadingMedia}>
                Publicar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EDIT POST MODAL */}
      {/* ============================================================ */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setEditingPost(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Editar Publicacao</h2>
            <div className="space-y-4">
              {/* Title */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Titulo *
                </label>
                <input
                  type="text"
                  placeholder="Titulo da publicacao"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                  className={cn(
                    "flex h-11 w-full rounded-xl border border-input bg-background px-4 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200"
                  )}
                />
              </div>

              {/* Content */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Conteudo *
                </label>
                <textarea
                  placeholder="Escreva o conteudo da publicacao..."
                  value={editForm.content}
                  onChange={(e) =>
                    setEditForm({ ...editForm, content: e.target.value })
                  }
                  rows={5}
                  className={cn(
                    "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200 resize-none"
                  )}
                />
              </div>

              {/* Audience */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Publico-alvo
                </label>
                <select
                  value={editForm.audience}
                  onChange={(e) =>
                    setEditForm({ ...editForm, audience: e.target.value })
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200"
                >
                  <option value={FeedAudience.ALL}>
                    {FEED_AUDIENCE_LABELS[FeedAudience.ALL]}
                  </option>
                  <option value={FeedAudience.EMPLOYEES}>
                    {FEED_AUDIENCE_LABELS[FeedAudience.EMPLOYEES]}
                  </option>
                  <option value={FeedAudience.PARTNERS}>
                    {FEED_AUDIENCE_LABELS[FeedAudience.PARTNERS]}
                  </option>
                </select>
              </div>

              {/* Media upload */}
              <div className="w-full space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Midia (imagens ou videos)
                </label>
                <div className="flex items-center gap-2">
                  <label className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-input cursor-pointer text-sm text-muted-foreground",
                    "hover:border-primary hover:text-foreground transition-colors",
                    isUploadingMedia && "opacity-50 pointer-events-none"
                  )}>
                    {isUploadingMedia ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                    {isUploadingMedia ? "Enviando..." : "Anexar arquivo"}
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/webm,video/quicktime"
                      multiple
                      onChange={(e) => handleMediaUpload(e, "edit")}
                      className="hidden"
                    />
                  </label>
                </div>
                {editMediaUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editMediaUrls.map((url, i) => (
                      <div key={i} className="relative group">
                        {isVideoUrl(url) ? (
                          <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center border">
                            <Film className="h-6 w-6 text-muted-foreground" />
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt={`Midia ${i + 1}`}
                            className="h-16 w-16 object-cover rounded-lg border"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setEditMediaUrls((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pinned toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={editForm.is_pinned}
                  onClick={() =>
                    setEditForm({
                      ...editForm,
                      is_pinned: !editForm.is_pinned,
                    })
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                    editForm.is_pinned ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
                      editForm.is_pinned ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
                <div className="flex items-center gap-1.5">
                  <Pin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground/80">
                    Fixar no topo
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setEditingPost(null)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} isLoading={isUpdating} disabled={isUploadingMedia}>
                Salvar Alteracoes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
