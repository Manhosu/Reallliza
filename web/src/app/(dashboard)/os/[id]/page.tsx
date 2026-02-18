"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Edit,
  Trash2,
  ChevronDown,
  Clock,
  FileText,
  CheckSquare,
  Camera,
  MapPin,
  Calendar,
  DollarSign,
  User,
  Building2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  ClipboardCheck,
  Upload,
  Image,
  X,
  Loader2,
  Check,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { cn } from "@/lib/utils";
import {
  OsStatus,
  OsPriority,
  PhotoType,
  OS_STATUS_LABELS,
  OS_PRIORITY_LABELS,
  UserRole,
  type ServiceOrder,
  type OsStatusHistory,
  type Checklist,
  type Photo,
  type Profile,
  type Partner,
} from "@/lib/types";
import {
  serviceOrdersApi,
  checklistsApi,
  checklistTemplatesApi,
  photosApi,
  usersApi,
  partnersApi,
} from "@/lib/api";
import type { PhotoCountResponse } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { Lightbox } from "@/components/ui/lightbox";
import type { LightboxImage } from "@/components/ui/lightbox";

// ============================================================
// Status Config
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

const STATUS_FLOW: OsStatus[] = [
  OsStatus.DRAFT,
  OsStatus.PENDING,
  OsStatus.ASSIGNED,
  OsStatus.IN_PROGRESS,
  OsStatus.COMPLETED,
];

const NEXT_STATUS_MAP: Partial<Record<OsStatus, OsStatus[]>> = {
  [OsStatus.DRAFT]: [OsStatus.PENDING],
  [OsStatus.PENDING]: [OsStatus.ASSIGNED, OsStatus.CANCELLED],
  [OsStatus.ASSIGNED]: [OsStatus.IN_PROGRESS, OsStatus.CANCELLED],
  [OsStatus.IN_PROGRESS]: [OsStatus.PAUSED, OsStatus.COMPLETED, OsStatus.CANCELLED],
  [OsStatus.PAUSED]: [OsStatus.IN_PROGRESS, OsStatus.CANCELLED],
};

// ============================================================
// Photo Type Config
// ============================================================

const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  [PhotoType.BEFORE]: "Antes",
  [PhotoType.DURING]: "Durante",
  [PhotoType.AFTER]: "Depois",
  [PhotoType.ISSUE]: "Problema",
  [PhotoType.SIGNATURE]: "Assinatura",
};

const PHOTO_TYPE_BADGE_VARIANT: Record<PhotoType, string> = {
  [PhotoType.BEFORE]: "info",
  [PhotoType.DURING]: "warning",
  [PhotoType.AFTER]: "success",
  [PhotoType.ISSUE]: "destructive",
  [PhotoType.SIGNATURE]: "purple",
};

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

function formatCurrency(val: number | null): string {
  if (val == null) return "-";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ============================================================
// Loading Skeleton
// ============================================================

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Not Found State
// ============================================================

function NotFoundState() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          OS não encontrada
        </h1>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1 text-center">
            <p className="font-medium text-foreground">
              Ordem de serviço não encontrada
            </p>
            <p className="text-sm text-muted-foreground">
              A OS solicitada não existe ou foi removida.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/os")}>
            Voltar para lista
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Checklist Section Component
// ============================================================

function ChecklistSection({
  serviceOrderId,
}: {
  serviceOrderId: string;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [isCompleting, setIsCompleting] = useState<string | null>(null);

  const {
    data: checklists,
    isLoading: checklistsLoading,
    mutate: mutateChecklists,
  } = useApi<Checklist[]>(
    () => checklistsApi.getByServiceOrder(serviceOrderId),
    [serviceOrderId]
  );

  const {
    data: templatesResponse,
  } = useApi(
    () => checklistTemplatesApi.list({ is_active: true, limit: 50 }),
    []
  );

  const templates = templatesResponse?.data ?? [];

  const handleCreateChecklist = async (templateId: string) => {
    setIsCreating(true);
    try {
      await checklistsApi.createFromTemplate({
        service_order_id: serviceOrderId,
        template_id: templateId,
      });
      mutateChecklists();
      toast.success("Checklist criado com sucesso");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao criar checklist";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleComplete = async (checklistId: string) => {
    setIsCompleting(checklistId);
    try {
      await checklistsApi.complete(checklistId);
      mutateChecklists();
      toast.success("Checklist concluído com sucesso");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao concluir checklist";
      toast.error(message);
    } finally {
      setIsCompleting(null);
    }
  };

  if (checklistsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-2 w-full rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!checklists || checklists.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ClipboardCheck className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">Nenhum checklist</p>
              <p className="text-sm text-muted-foreground">
                Crie um checklist a partir de um template para acompanhar o
                progresso
              </p>
            </div>
            {templates.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {templates.map((template) => (
                  <Button
                    key={template.id}
                    variant="outline"
                    size="sm"
                    disabled={isCreating}
                    isLoading={isCreating}
                    onClick={() => handleCreateChecklist(template.id)}
                  >
                    {template.name}
                  </Button>
                ))}
              </div>
            ) : (
              <Button disabled={isCreating} isLoading={isCreating}>
                Criar Checklist
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-primary" />
          Checklist
        </CardTitle>
        {templates.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={isCreating}
            isLoading={isCreating}
            onClick={() => {
              if (templates.length > 0) {
                handleCreateChecklist(templates[0].id);
              }
            }}
          >
            Adicionar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {checklists.map((checklist) => {
          const totalItems = checklist.items.length;
          const checkedItems = checklist.items.filter((i) => i.checked).length;
          const percentage =
            totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
          const isComplete = checklist.completed_at !== null;
          const allChecked = checkedItems === totalItems && totalItems > 0;

          return (
            <div key={checklist.id} className="space-y-3">
              {/* Title and percentage */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{checklist.title}</p>
                  {isComplete && (
                    <Badge variant="success" size="sm">
                      Concluído
                    </Badge>
                  )}
                </div>
                <span
                  className={cn(
                    "text-sm font-medium",
                    percentage === 100
                      ? "text-green-500"
                      : percentage > 0
                      ? "text-yellow-500"
                      : "text-muted-foreground"
                  )}
                >
                  {checkedItems}/{totalItems} ({percentage}%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className={cn(
                    "h-full rounded-full",
                    percentage === 100
                      ? "bg-green-500"
                      : percentage > 0
                      ? "bg-yellow-500"
                      : "bg-muted-foreground"
                  )}
                />
              </div>

              {/* Items list */}
              <div className="space-y-1.5">
                {checklist.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                        item.checked
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {item.checked && <Check className="h-3 w-3" />}
                    </div>
                    <span
                      className={cn(
                        "text-sm",
                        item.checked && "text-muted-foreground line-through"
                      )}
                    >
                      {item.label}
                    </span>
                    {item.notes && (
                      <span className="text-xs text-muted-foreground">
                        - {item.notes}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Complete button */}
              {allChecked && !isComplete && (
                <Button
                  size="sm"
                  onClick={() => handleComplete(checklist.id)}
                  disabled={isCompleting === checklist.id}
                  isLoading={isCompleting === checklist.id}
                  className="mt-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Concluir Checklist
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Photos Section Component
// ============================================================

type PhotoFilter = "all" | PhotoType;

function PhotosSection({
  serviceOrderId,
}: {
  serviceOrderId: string;
}) {
  const [activeFilter, setActiveFilter] = useState<PhotoFilter>("all");
  const [uploadType, setUploadType] = useState<PhotoType>(PhotoType.BEFORE);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: photos,
    isLoading: photosLoading,
    mutate: mutatePhotos,
  } = useApi<Photo[]>(
    () =>
      activeFilter === "all"
        ? photosApi.getByServiceOrder(serviceOrderId)
        : photosApi.getByServiceOrder(serviceOrderId, activeFilter as PhotoType),
    [serviceOrderId, activeFilter]
  );

  const {
    data: photoCounts,
    mutate: mutateCounts,
  } = useApi<PhotoCountResponse>(
    () => photosApi.getCountByServiceOrder(serviceOrderId),
    [serviceOrderId]
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        await photosApi.upload(file, {
          service_order_id: serviceOrderId,
          type: uploadType,
        });
        mutatePhotos();
        mutateCounts();
        toast.success("Foto enviada com sucesso");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro ao enviar foto";
        toast.error(message);
      } finally {
        setIsUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [serviceOrderId, uploadType, mutatePhotos, mutateCounts]
  );

  const handleDelete = async (photoId: string) => {
    setIsDeleting(photoId);
    setShowDeleteConfirm(null);
    try {
      await photosApi.delete(photoId);
      mutatePhotos();
      mutateCounts();
      toast.success("Foto excluída com sucesso");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao excluir foto";
      toast.error(message);
    } finally {
      setIsDeleting(null);
    }
  };

  const triggerUpload = (type: PhotoType) => {
    setUploadType(type);
    // Small delay so the state updates before the file dialog
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  // Build lightbox images from the current photos list
  const lightboxImages: LightboxImage[] = (photos || []).map((photo) => ({
    src: photo.url,
    alt: photo.description || `Foto ${PHOTO_TYPE_LABELS[photo.type]}`,
    caption: photo.description || PHOTO_TYPE_LABELS[photo.type],
  }));

  const handleOpenLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const filterTabs: { key: PhotoFilter; label: string; count?: number }[] = [
    { key: "all", label: "Todas", count: photoCounts?.total },
    { key: PhotoType.BEFORE, label: "Antes", count: photoCounts?.before },
    { key: PhotoType.DURING, label: "Durante", count: photoCounts?.during },
    { key: PhotoType.AFTER, label: "Depois", count: photoCounts?.after },
    { key: PhotoType.ISSUE, label: "Problemas", count: photoCounts?.issue },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          Fotos
          {photoCounts && photoCounts.total > 0 && (
            <Badge variant="gray" size="sm">
              {photoCounts.total}
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {/* Upload type selector + button */}
          <div className="flex items-center gap-1">
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as PhotoType)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(PHOTO_TYPE_LABELS)
                .filter(([key]) => key !== PhotoType.SIGNATURE)
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={isUploading}
              isLoading={isUploading}
              onClick={() => triggerUpload(uploadType)}
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          </div>
        </div>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                activeFilter === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px]",
                    activeFilter === tab.key
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Photos grid */}
        {photosLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : !photos || photos.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Image className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">Nenhuma foto registrada</p>
              <p className="text-sm text-muted-foreground">
                Fotos do antes, durante e depois do serviço aparecerão aqui
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => triggerUpload(PhotoType.BEFORE)}
              disabled={isUploading}
            >
              <Upload className="h-4 w-4" />
              Adicionar primeira foto
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05, duration: 0.25 }}
                className="group relative"
              >
                <div
                  className="relative aspect-square overflow-hidden rounded-xl border bg-muted cursor-pointer"
                  onClick={() => handleOpenLightbox(index)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnail_url || photo.url}
                    alt={photo.description || `Foto ${PHOTO_TYPE_LABELS[photo.type]}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* Type badge overlay */}
                  <div className="absolute left-2 top-2">
                    <Badge
                      variant={PHOTO_TYPE_BADGE_VARIANT[photo.type] as any}
                      size="sm"
                    >
                      {PHOTO_TYPE_LABELS[photo.type]}
                    </Badge>
                  </div>

                  {/* Delete button overlay */}
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                    {showDeleteConfirm === photo.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500 text-white shadow-md transition-colors hover:bg-red-600"
                          disabled={isDeleting === photo.id}
                        >
                          {isDeleting === photo.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null); }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/90 text-foreground shadow-md transition-colors hover:bg-background"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(photo.id); }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/90 text-destructive shadow-md transition-colors hover:bg-background"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Upload loading overlay */}
                  {isDeleting === photo.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>

                {/* Photo info */}
                <div className="mt-1.5 space-y-0.5 px-0.5">
                  {photo.description && (
                    <p className="truncate text-xs font-medium">
                      {photo.description}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {formatDateTime(photo.taken_at || photo.created_at)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Upload loading indicator */}
        {isUploading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Enviando foto...
            </span>
          </div>
        )}
      </CardContent>

      {/* Photo Lightbox */}
      <Lightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </Card>
  );
}

// ============================================================
// OS Detail Page
// ============================================================

export default function OsDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const user = useAuthStore((s) => s.user);
  const isPartner = user?.role === UserRole.PARTNER;

  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [partnersList, setPartnersList] = useState<Partner[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    priority: "" as string,
    client_name: "",
    client_phone: "",
    client_email: "",
    client_document: "",
    address_street: "",
    address_number: "",
    address_complement: "",
    address_neighborhood: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    technician_id: "",
    partner_id: "",
    scheduled_date: "",
    estimated_value: "",
    notes: "",
  });

  // Fetch service order by ID
  const {
    data: order,
    error: orderError,
    isLoading: orderLoading,
    mutate: mutateOrder,
  } = useApi<ServiceOrder>(
    (signal) => serviceOrdersApi.getById(id),
    [id]
  );

  // Fetch timeline
  const {
    data: history,
    isLoading: historyLoading,
    mutate: mutateTimeline,
  } = useApi<OsStatusHistory[]>(
    (signal) => serviceOrdersApi.getTimeline(id),
    [id]
  );

  const handleChangeStatus = async (newStatus: OsStatus) => {
    setShowStatusMenu(false);
    setIsChangingStatus(true);
    try {
      await serviceOrdersApi.changeStatus(id, newStatus);
      mutateOrder();
      mutateTimeline();
      toast.success("Status alterado com sucesso");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao alterar status";
      toast.error(message);
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleOpenEdit = async () => {
    if (!order) return;
    setEditForm({
      title: order.title || "",
      description: order.description || "",
      priority: order.priority || OsPriority.MEDIUM,
      client_name: order.client_name || "",
      client_phone: order.client_phone || "",
      client_email: order.client_email || "",
      client_document: order.client_document || "",
      address_street: order.address_street || "",
      address_number: order.address_number || "",
      address_complement: order.address_complement || "",
      address_neighborhood: order.address_neighborhood || "",
      address_city: order.address_city || "",
      address_state: order.address_state || "",
      address_zip: order.address_zip || "",
      technician_id: order.technician_id || "",
      partner_id: order.partner_id || "",
      scheduled_date: order.scheduled_date || "",
      estimated_value: order.estimated_value != null ? String(order.estimated_value) : "",
      notes: order.notes || "",
    });
    setShowEditModal(true);
    // Load dropdowns for technicians and partners
    setLoadingDropdowns(true);
    try {
      const [techRes, partRes] = await Promise.all([
        usersApi.list({ role: UserRole.TECHNICIAN, limit: 100 }),
        partnersApi.list({ is_active: true, limit: 100 }),
      ]);
      setTechnicians(techRes.data);
      setPartnersList(partRes.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dados";
      toast.error(message);
    } finally {
      setLoadingDropdowns(false);
    }
  };

  const handleUpdate = async () => {
    if (!editForm.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    if (!editForm.client_name.trim()) {
      toast.error("Nome do cliente é obrigatório");
      return;
    }
    setIsUpdating(true);
    try {
      // Build payload and strip undefined/null values so @IsOptional() works correctly
      const raw: Record<string, unknown> = {
        title: editForm.title.trim(),
        description: editForm.description.trim() || undefined,
        priority: editForm.priority as OsPriority,
        client_name: editForm.client_name.trim(),
        client_phone: editForm.client_phone.trim() || undefined,
        client_email: editForm.client_email.trim() || undefined,
        client_document: editForm.client_document.trim() || undefined,
        address_street: editForm.address_street.trim() || undefined,
        address_number: editForm.address_number.trim() || undefined,
        address_complement: editForm.address_complement.trim() || undefined,
        address_neighborhood: editForm.address_neighborhood.trim() || undefined,
        address_city: editForm.address_city.trim() || undefined,
        address_state: editForm.address_state.trim() || undefined,
        address_zip: editForm.address_zip.trim() || undefined,
        technician_id: editForm.technician_id || undefined,
        partner_id: editForm.partner_id || undefined,
        scheduled_date: editForm.scheduled_date || undefined,
        estimated_value: editForm.estimated_value ? parseFloat(editForm.estimated_value) : undefined,
        notes: editForm.notes.trim() || undefined,
      };
      // Remove undefined keys so they don't appear as null in JSON
      const payload = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== undefined)
      );
      await serviceOrdersApi.update(id, payload);
      toast.success("OS atualizada com sucesso");
      setShowEditModal(false);
      mutateOrder();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar OS";
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelOS = async () => {
    setIsCancelling(true);
    try {
      await serviceOrdersApi.changeStatus(id, OsStatus.CANCELLED, "Cancelada pelo admin");
      toast.success("OS cancelada com sucesso");
      setShowDeleteConfirmModal(false);
      router.push("/os");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao cancelar OS";
      toast.error(message);
    } finally {
      setIsCancelling(false);
    }
  };

  if (orderLoading) {
    return <DetailSkeleton />;
  }

  if (orderError || !order) {
    return <NotFoundState />;
  }

  const nextStatuses = NEXT_STATUS_MAP[order.status] || [];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.06 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
                {order.order_number}
              </h1>
              <Badge variant={STATUS_BADGE_VARIANT[order.status] as any}>
                {OS_STATUS_LABELS[order.status]}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {isPartner ? `Chamado: ${order.title}` : order.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Change Status - visible to all roles */}
          {nextStatuses.length > 0 && !isPartner && (
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                disabled={isChangingStatus}
                isLoading={isChangingStatus}
              >
                Alterar Status
                <ChevronDown className="h-4 w-4" />
              </Button>
              {showStatusMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border bg-popover p-1 shadow-lg"
                >
                  {nextStatuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => handleChangeStatus(status)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                    >
                      <Badge
                        variant={STATUS_BADGE_VARIANT[status] as any}
                        size="sm"
                      >
                        {OS_STATUS_LABELS[status]}
                      </Badge>
                    </button>
                  ))}
                </motion.div>
              )}
            </div>
          )}

          {!isPartner && order.status !== OsStatus.COMPLETED && order.status !== OsStatus.CANCELLED && order.status !== OsStatus.REJECTED && (
            <>
              <Button variant="outline" size="icon" onClick={handleOpenEdit}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setShowDeleteConfirmModal(true)}>
                <XCircle className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </motion.div>

      {/* Status Timeline */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between overflow-x-auto">
              {STATUS_FLOW.map((status, index) => {
                const currentIndex = STATUS_FLOW.indexOf(order.status);
                const isPast = index <= currentIndex;
                const isCurrent = status === order.status;

                return (
                  <div key={status} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                          isCurrent
                            ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30"
                            : isPast
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-muted bg-muted text-muted-foreground"
                        )}
                      >
                        {isPast && !isCurrent ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <span className="text-xs font-bold">{index + 1}</span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "whitespace-nowrap text-[10px] font-medium",
                          isCurrent
                            ? "text-primary"
                            : isPast
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {OS_STATUS_LABELS[status]}
                      </span>
                    </div>
                    {index < STATUS_FLOW.length - 1 && (
                      <div
                        className={cn(
                          "mx-2 h-0.5 flex-1 rounded-full",
                          index < currentIndex ? "bg-primary" : "bg-muted"
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - 2 cols */}
        <div className="space-y-6 lg:col-span-2">
          {/* Informações */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Informações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Description */}
                {order.description && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Descrição
                    </p>
                    <p className="text-sm leading-relaxed">{order.description}</p>
                  </div>
                )}

                {/* Info Grid */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Client Info */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Cliente
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {order.client_name}
                        </span>
                      </div>
                      {order.client_phone && (
                        <p className="pl-6 text-sm text-muted-foreground">
                          {order.client_phone}
                        </p>
                      )}
                      {order.client_email && (
                        <p className="pl-6 text-sm text-muted-foreground">
                          {order.client_email}
                        </p>
                      )}
                      {order.client_document && (
                        <p className="pl-6 text-sm text-muted-foreground">
                          {order.client_document}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Endereço
                    </p>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="text-sm">
                        <p>
                          {order.address_street}, {order.address_number}
                          {order.address_complement
                            ? ` - ${order.address_complement}`
                            : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {order.address_neighborhood} - {order.address_city}/
                          {order.address_state}
                        </p>
                        <p className="text-muted-foreground">
                          CEP: {order.address_zip}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Priority */}
                <div className="flex items-center gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Prioridade
                  </p>
                  <Badge
                    variant={PRIORITY_BADGE_VARIANT[order.priority] as any}
                  >
                    {OS_PRIORITY_LABELS[order.priority]}
                  </Badge>
                </div>

                {/* Notes */}
                {order.notes && (
                  <div className="space-y-1.5 rounded-xl bg-muted/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Observações
                    </p>
                    <p className="text-sm leading-relaxed">{order.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Status History */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Histórico de Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex gap-4">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !history || history.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                      <Clock className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Nenhum histórico disponível
                    </p>
                  </div>
                ) : (
                  <div className="relative space-y-0">
                    {/* Vertical line */}
                    <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

                    {history
                      .slice()
                      .reverse()
                      .map((entry, index) => (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + index * 0.08, duration: 0.3 }}
                          className="relative flex gap-4 pb-6 last:pb-0"
                        >
                          <div
                            className={cn(
                              "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                              index === 0
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-muted bg-background text-muted-foreground"
                            )}
                          >
                            {entry.to_status === OsStatus.COMPLETED ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : entry.to_status === OsStatus.CANCELLED ? (
                              <XCircle className="h-4 w-4" />
                            ) : entry.to_status === OsStatus.PAUSED ? (
                              <PauseCircle className="h-4 w-4" />
                            ) : entry.to_status === OsStatus.IN_PROGRESS ? (
                              <PlayCircle className="h-4 w-4" />
                            ) : (
                              <Clock className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  STATUS_BADGE_VARIANT[entry.to_status] as any
                                }
                                size="sm"
                              >
                                {OS_STATUS_LABELS[entry.to_status]}
                              </Badge>
                              {entry.from_status && (
                                <span className="text-xs text-muted-foreground">
                                  (de {OS_STATUS_LABELS[entry.from_status]})
                                </span>
                              )}
                            </div>
                            {entry.notes && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {entry.notes}
                              </p>
                            )}
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{(entry as any).changed_by_user?.full_name || entry.changed_by}</span>
                              <span>&middot;</span>
                              <span>{formatDateTime(entry.created_at)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Checklist Section */}
          <motion.div variants={itemVariants}>
            <ChecklistSection serviceOrderId={id} />
          </motion.div>

          {/* Photos Section */}
          <motion.div variants={itemVariants}>
            <PhotosSection serviceOrderId={id} />
          </motion.div>

          {/* Mapa */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Mapa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4 rounded-xl bg-muted/50 py-12">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    <MapPin className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">Localização não disponível</p>
                    <p className="text-sm text-muted-foreground">
                      As coordenadas GPS serão capturadas pelo técnico no local
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Técnico */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Técnico Atribuído
                </CardTitle>
              </CardHeader>
              <CardContent>
                {order.technician_id ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                      T
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {(order as any).technician?.full_name || order.technician_id}
                      </p>
                      <p className="text-xs text-muted-foreground">Técnico</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed p-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Nenhum técnico atribuído
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Parceiro */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Parceiro
                </CardTitle>
              </CardHeader>
              <CardContent>
                {order.partner_id ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15 text-sm font-bold text-green-500">
                      P
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {(order as any).partner?.company_name || (order as any).partner?.trading_name || order.partner_id}
                      </p>
                      <p className="text-xs text-muted-foreground">Parceiro</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed p-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Sem parceiro vinculado
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Datas */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Datas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Criação
                  </div>
                  <span className="text-sm font-medium">
                    {formatDate(order.created_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Agendamento
                  </div>
                  <span className="text-sm font-medium">
                    {formatDate(order.scheduled_date)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <PlayCircle className="h-4 w-4" />
                    Início
                  </div>
                  <span className="text-sm font-medium">
                    {formatDateTime(order.started_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    Conclusão
                  </div>
                  <span className="text-sm font-medium">
                    {formatDateTime(order.completed_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Valores */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Valores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    Estimado
                  </div>
                  <span className="text-sm font-medium">
                    {formatCurrency(order.estimated_value)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    Final
                  </div>
                  <span className="text-sm font-semibold text-primary">
                    {formatCurrency(order.final_value)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
      {/* ============ Delete Confirmation Modal ============ */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold">Cancelar OS</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Tem certeza que deseja cancelar esta OS? Esta ação não pode ser desfeita. A OS será marcada como &quot;Cancelada&quot;.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteConfirmModal(false)} disabled={isCancelling}>
                Voltar
              </Button>
              <Button variant="destructive" onClick={handleCancelOS} isLoading={isCancelling}>
                <XCircle className="h-4 w-4" />
                Sim, Cancelar OS
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Edit Modal ============ */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Editar OS</h2>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <Input
                label="Título *"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Descrição</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectNative
                  label="Prioridade"
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                >
                  {Object.values(OsPriority).map((p) => (
                    <option key={p} value={p}>{OS_PRIORITY_LABELS[p]}</option>
                  ))}
                </SelectNative>
                <SelectNative
                  label="Parceiro"
                  value={editForm.partner_id}
                  onChange={(e) => setEditForm({ ...editForm, partner_id: e.target.value })}
                  disabled={loadingDropdowns}
                >
                  <option value="">{loadingDropdowns ? "Carregando..." : "Nenhum parceiro"}</option>
                  {partnersList.map((p) => (
                    <option key={p.id} value={p.id}>{p.company_name}</option>
                  ))}
                </SelectNative>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Nome do Cliente *"
                  value={editForm.client_name}
                  onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })}
                />
                <Input
                  label="Telefone"
                  value={editForm.client_phone}
                  onChange={(e) => setEditForm({ ...editForm, client_phone: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="E-mail"
                  value={editForm.client_email}
                  onChange={(e) => setEditForm({ ...editForm, client_email: e.target.value })}
                />
                <Input
                  label="CPF / CNPJ"
                  value={editForm.client_document}
                  onChange={(e) => setEditForm({ ...editForm, client_document: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Input
                    label="Rua"
                    value={editForm.address_street}
                    onChange={(e) => setEditForm({ ...editForm, address_street: e.target.value })}
                  />
                </div>
                <Input
                  label="Número"
                  value={editForm.address_number}
                  onChange={(e) => setEditForm({ ...editForm, address_number: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Complemento"
                  value={editForm.address_complement}
                  onChange={(e) => setEditForm({ ...editForm, address_complement: e.target.value })}
                />
                <Input
                  label="Bairro"
                  value={editForm.address_neighborhood}
                  onChange={(e) => setEditForm({ ...editForm, address_neighborhood: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  label="Cidade"
                  value={editForm.address_city}
                  onChange={(e) => setEditForm({ ...editForm, address_city: e.target.value })}
                />
                <Input
                  label="Estado"
                  value={editForm.address_state}
                  onChange={(e) => setEditForm({ ...editForm, address_state: e.target.value })}
                />
                <Input
                  label="CEP"
                  value={editForm.address_zip}
                  onChange={(e) => setEditForm({ ...editForm, address_zip: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectNative
                  label="Técnico"
                  value={editForm.technician_id}
                  onChange={(e) => setEditForm({ ...editForm, technician_id: e.target.value })}
                  disabled={loadingDropdowns}
                >
                  <option value="">{loadingDropdowns ? "Carregando..." : "Nenhum técnico"}</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </SelectNative>
                <Input
                  label="Data Agendada"
                  type="date"
                  value={editForm.scheduled_date}
                  onChange={(e) => setEditForm({ ...editForm, scheduled_date: e.target.value })}
                />
              </div>
              <Input
                label="Valor Estimado (R$)"
                type="number"
                min="0"
                step="0.01"
                value={editForm.estimated_value}
                onChange={(e) => setEditForm({ ...editForm, estimated_value: e.target.value })}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Observações</label>
                <textarea
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
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={isUpdating}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} isLoading={isUpdating}>
                <Save className="h-4 w-4" />
                Salvar Alterações
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
