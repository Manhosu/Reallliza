"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Plus,
  X,
  Image as ImageIcon,
  Video,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SelectNative } from "@/components/ui/select-native";
import { apiClient } from "@/lib/api/client";
import { quotesApi } from "@/lib/api";
import type { Quote } from "@/lib/api/quotes";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface WarrantyMedia {
  url: string;
  thumbnail_url?: string | null;
  storage_path?: string | null;
}

interface Warranty {
  id: string;
  service_order_id: string;
  partner_id: string | null;
  status: "open" | "in_progress" | "resolved" | "rejected";
  description: string;
  photos: WarrantyMedia[];
  videos: WarrantyMedia[];
  notes: string | null;
  resolution_notes: string | null;
  opened_at: string;
  resolved_at: string | null;
  service_order?: {
    id: string;
    order_number: number | null;
    title: string | null;
    client_name: string | null;
    completed_at: string | null;
  } | null;
}

interface QuoteWithOs extends Quote {
  service_order_status?: string | null;
  service_order?: { status: string } | null;
}

const STATUS_CONFIG: Record<
  Warranty["status"],
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  open: {
    label: "Aberta",
    icon: AlertCircle,
    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  in_progress: {
    label: "Em análise",
    icon: Clock,
    cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  resolved: {
    label: "Resolvida",
    icon: CheckCircle2,
    cls: "bg-green-500/10 text-green-700 dark:text-green-300",
  },
  rejected: {
    label: "Recusada",
    icon: XCircle,
    cls: "bg-zinc-500/10 text-zinc-500",
  },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

// useSearchParams exige Suspense boundary no prerender do Next 16
export default function GarantiasPageWrapper() {
  return (
    <Suspense fallback={null}>
      <GarantiasPageInner />
    </Suspense>
  );
}

function GarantiasPageInner() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === UserRole.ADMIN;

  const searchParams = useSearchParams();
  // Deep-link do dashboard: /garantias?status=open|resolved
  const initialStatusFilter =
    (searchParams.get("status") as Warranty["status"] | null) ?? "all";
  const [statusFilter, setStatusFilter] = useState<
    "all" | Warranty["status"]
  >(initialStatusFilter as "all" | Warranty["status"]);

  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [completedOs, setCompletedOs] = useState<QuoteWithOs[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<WarrantyMedia[]>([]);
  const [videos, setVideos] = useState<WarrantyMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [w, q] = await Promise.all([
        apiClient.get<Warranty[]>("/warranties"),
        quotesApi.list() as Promise<QuoteWithOs[]>,
      ]);
      setWarranties(w);
      // OSs concluidas elegíveis pra garantia
      setCompletedOs(
        q.filter((qq) => {
          const os = qq.service_order_status ?? qq.service_order?.status;
          return (
            qq.service_order_id &&
            os &&
            ["completed", "approved", "invoiced"].includes(os)
          );
        })
      );
    } catch (err) {
      console.error("Failed to load warranties:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = useCallback(() => {
    setSelectedOsId("");
    setDescription("");
    setNotes("");
    setPhotos([]);
    setVideos([]);
    setError(null);
  }, []);

  async function handleUpload(
    file: File,
    kind: "photo" | "video"
  ): Promise<WarrantyMedia | null> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${user?.id ?? "anon"}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from("warranties")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      toast.error(`Falha no upload: ${upErr.message}`);
      return null;
    }
    const { data: pub } = supabase.storage.from("warranties").getPublicUrl(path);
    return {
      url: pub.publicUrl,
      thumbnail_url: kind === "photo" ? pub.publicUrl : null,
      storage_path: path,
    };
  }

  async function handleFiles(files: FileList | null, kind: "photo" | "video") {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const arr = Array.from(files);
      for (const f of arr) {
        const limit = kind === "video" ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
        if (f.size > limit) {
          toast.error(
            `${f.name}: maior que ${kind === "video" ? "200MB" : "10MB"}`
          );
          continue;
        }
        const m = await handleUpload(f, kind);
        if (m) {
          if (kind === "photo") setPhotos((p) => [...p, m]);
          else setVideos((p) => [...p, m]);
        }
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!selectedOsId) {
      setError("Selecione a OS de origem.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Descreva o problema com pelo menos 10 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post<Warranty>("/warranties", {
        service_order_id: selectedOsId,
        description: description.trim(),
        notes: notes.trim() || undefined,
        photos,
        videos,
      });
      toast.success("Garantia aberta");
      setShowModal(false);
      resetForm();
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Erro ao abrir garantia";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Garantias
          </h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Solicitações de garantia abertas pelas lojas."
              : "Abra e acompanhe garantias vinculadas a OSs concluídas."}
          </p>
        </div>
        {!isAdmin && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" />
            Nova garantia
          </Button>
        )}
      </motion.div>

      {/* Filtro de status — vem do dashboard via ?status= */}
      <div className="flex flex-wrap gap-2 rounded-xl bg-secondary/50 p-1">
        {(
          [
            { key: "all", label: "Todas" },
            { key: "open", label: "Abertas" },
            { key: "in_progress", label: "Em análise" },
            { key: "resolved", label: "Resolvidas" },
            { key: "rejected", label: "Rejeitadas" },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key as typeof statusFilter)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              statusFilter === f.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : (statusFilter === "all"
          ? warranties
          : warranties.filter((w) => w.status === statusFilter)
        ).length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" />}
          title="Nenhuma garantia"
          description={
            isAdmin
              ? "Quando uma loja abrir garantia ela aparece aqui."
              : "Selecione uma OS concluída e descreva o problema para abrir."
          }
        />
      ) : (
        <div className="space-y-2">
          {(statusFilter === "all"
            ? warranties
            : warranties.filter((w) => w.status === statusFilter)
          ).map((w) => {
            const cfg = STATUS_CONFIG[w.status];
            const StatusIcon = cfg.icon;
            return (
              <Card key={w.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                        cfg.cls
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {cfg.label}
                    </div>
                    {w.service_order && (
                      <span className="text-sm font-semibold">
                        OS #{w.service_order.order_number ?? "—"}
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      · {w.service_order?.client_name ?? "—"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Aberta em {formatDate(w.opened_at)}
                    </span>
                  </div>
                  <p className="text-sm">{w.description}</p>
                  {w.notes && (
                    <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                      <strong>Observações:</strong> {w.notes}
                    </p>
                  )}
                  {(w.photos.length > 0 || w.videos.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {w.photos.map((p, i) => (
                        <a
                          key={`p-${i}`}
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block h-16 w-16 overflow-hidden rounded-lg border border-border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.thumbnail_url || p.url}
                            alt="Foto"
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                      {w.videos.map((v, i) => (
                        <a
                          key={`v-${i}`}
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-black/50 text-white"
                          title="Vídeo"
                        >
                          <Video className="h-5 w-5" />
                        </a>
                      ))}
                    </div>
                  )}
                  {w.resolution_notes && (
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Resposta da Reallliza
                      </p>
                      <p className="mt-1 text-sm">{w.resolution_notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal nova garantia */}
      <Dialog open={showModal} onClose={() => setShowModal(false)}>
        <DialogHeader>
          <DialogTitle>Abrir solicitação de garantia</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">OS de origem</label>
            <SelectNative
              value={selectedOsId}
              onChange={(e) => setSelectedOsId(e.target.value)}
            >
              <option value="">Selecione uma OS concluída...</option>
              {completedOs.map((q) => (
                <option key={q.service_order_id!} value={q.service_order_id!}>
                  #{q.quote_number} — {q.client_name} ({formatDate(q.paid_at)})
                </option>
              ))}
            </SelectNative>
            {completedOs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Você ainda não tem OSs concluídas elegíveis.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Descrição do problema *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              minLength={10}
              maxLength={2000}
              placeholder="Descreva o problema com o serviço executado..."
              className="flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/2000 caracteres
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Observações (opcional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>

          {/* Uploads */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Fotos e vídeos</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div
                  key={`p-${i}`}
                  className="relative h-16 w-16 overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumbnail_url || p.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPhotos((arr) => arr.filter((_, idx) => idx !== i))
                    }
                    className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {videos.map((v, i) => (
                <div
                  key={`v-${i}`}
                  className="relative flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-black/50 text-white"
                >
                  <Video className="h-5 w-5" />
                  <button
                    type="button"
                    onClick={() =>
                      setVideos((arr) => arr.filter((_, idx) => idx !== i))
                    }
                    className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-input bg-background hover:bg-muted">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    handleFiles(e.target.files, "photo");
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-input bg-background hover:bg-muted">
                <Video className="h-5 w-5 text-muted-foreground" />
                <input
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    handleFiles(e.target.files, "video");
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {uploading && (
              <p className="text-xs text-muted-foreground">Enviando...</p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowModal(false);
              resetForm();
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            isLoading={submitting}
            disabled={uploading}
          >
            Abrir garantia
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
