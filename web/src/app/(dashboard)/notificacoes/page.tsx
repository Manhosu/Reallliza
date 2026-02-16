"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  ClipboardList,
  Calendar,
  Wrench,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { notificationsApi } from "@/lib/api";
import { usePaginatedApi } from "@/hooks/use-api";
import { NotificationType, type Notification } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============================================================
// Notification Icon by Type
// ============================================================

const NOTIFICATION_ICONS: Record<NotificationType, React.ReactNode> = {
  [NotificationType.OS_CREATED]: <ClipboardList className="h-5 w-5" />,
  [NotificationType.OS_ASSIGNED]: <ClipboardList className="h-5 w-5" />,
  [NotificationType.OS_STATUS_CHANGED]: <AlertCircle className="h-5 w-5" />,
  [NotificationType.OS_COMPLETED]: <CheckCheck className="h-5 w-5" />,
  [NotificationType.OS_CANCELLED]: <AlertCircle className="h-5 w-5" />,
  [NotificationType.SCHEDULE_REMINDER]: <Calendar className="h-5 w-5" />,
  [NotificationType.TOOL_CUSTODY]: <Wrench className="h-5 w-5" />,
  [NotificationType.SYSTEM]: <Bell className="h-5 w-5" />,
};

const NOTIFICATION_ICON_COLORS: Record<NotificationType, string> = {
  [NotificationType.OS_CREATED]: "bg-blue-500/15 text-blue-500",
  [NotificationType.OS_ASSIGNED]: "bg-purple-500/15 text-purple-500",
  [NotificationType.OS_STATUS_CHANGED]: "bg-yellow-500/15 text-yellow-600",
  [NotificationType.OS_COMPLETED]: "bg-green-500/15 text-green-500",
  [NotificationType.OS_CANCELLED]: "bg-red-500/15 text-red-500",
  [NotificationType.SCHEDULE_REMINDER]: "bg-orange-500/15 text-orange-500",
  [NotificationType.TOOL_CUSTODY]: "bg-cyan-500/15 text-cyan-500",
  [NotificationType.SYSTEM]: "bg-zinc-500/15 text-zinc-500",
};

// ============================================================
// Skeleton
// ============================================================

function NotificationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 rounded-xl border p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export default function NotificacoesPage() {
  const [markingAll, setMarkingAll] = useState(false);

  const fetcher = useCallback((page: number, limit: number) => {
    return notificationsApi.list({ page, limit });
  }, []);

  const {
    data: notifications,
    meta,
    isLoading,
    page,
    setPage,
    mutate,
  } = usePaginatedApi<Notification>(fetcher, 1, 15);

  const totalPages = meta?.total_pages ?? 1;
  const totalNotifications = meta?.total ?? 0;

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      mutate();
    } catch {
      toast.error("Erro ao marcar notificacao como lida.");
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllAsRead();
      toast.success("Todas as notificacoes foram marcadas como lidas.");
      mutate();
    } catch {
      toast.error("Erro ao marcar notificacoes como lidas.");
    } finally {
      setMarkingAll(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), {
        addSuffix: true,
        locale: ptBR,
      });
    } catch {
      return dateStr;
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
            Notificacoes
          </h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${totalNotifications} notificac${totalNotifications !== 1 ? "oes" : "ao"}`}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleMarkAllAsRead}
          isLoading={markingAll}
          disabled={markingAll || isLoading}
        >
          <CheckCheck className="h-4 w-4" />
          Marcar todas como lidas
        </Button>
      </motion.div>

      {/* Notifications List */}
      {isLoading ? (
        <NotificationsSkeleton />
      ) : !notifications || notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title="Nenhuma notificacao"
            description="Voce nao possui notificacoes no momento. Novas notificacoes aparecero aqui."
          />
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="space-y-2"
        >
          {notifications.map((notification, index) => {
            const isUnread = !notification.read_at;
            const icon =
              NOTIFICATION_ICONS[notification.type] || (
                <Bell className="h-5 w-5" />
              );
            const iconColor =
              NOTIFICATION_ICON_COLORS[notification.type] ||
              "bg-zinc-500/15 text-zinc-500";

            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
              >
                <Card
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    isUnread && "border-l-4 border-l-yellow-500"
                  )}
                  onClick={() => {
                    if (isUnread) handleMarkAsRead(notification.id);
                  }}
                >
                  <div className="flex items-start gap-4 p-4">
                    {/* Icon */}
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        iconColor
                      )}
                    >
                      {icon}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3
                          className={cn(
                            "text-sm",
                            isUnread
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground/80"
                          )}
                        >
                          {notification.title}
                        </h3>
                        {isUnread && (
                          <Badge variant="warning" size="sm">
                            Nova
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {formatTimeAgo(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}

          {/* Pagination */}
          {meta && totalPages > 1 && (
            <Card>
              <div className="flex items-center justify-between px-6 py-4">
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
            </Card>
          )}
        </motion.div>
      )}
    </div>
  );
}
