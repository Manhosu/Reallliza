"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  MapPin,
  Navigation,
  Clock,
  ExternalLink,
  RefreshCw,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { trackingApi } from "@/lib/api";
import { type TechnicianLocation } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole } from "@/lib/types";

// ============================================================
// Helpers
// ============================================================

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

function timeSince(dateStr: string): string {
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = now.getTime() - past.getTime();

  if (diffMs < 0) return "agora";

  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s atrás`;

  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}min atrás`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h atrás`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d atrás`;
}

function formatCoord(value: number | null): string {
  if (value === null || value === undefined) return "--";
  return value.toFixed(6);
}

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  in_transit: { label: "Em Rota", variant: "warning" },
  in_progress: { label: "Em Atendimento", variant: "info" },
};

// ============================================================
// Skeleton
// ============================================================

function TechnicianCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-9 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

// ============================================================
// Page
// ============================================================

export default function MapaPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [technicians, setTechnicians] = useState<TechnicianLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Admin-only check
  useEffect(() => {
    if (user && user.role !== UserRole.ADMIN) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const fetchData = useCallback(async () => {
    try {
      const data = await trackingApi.getTechnicians();
      setTechnicians(Array.isArray(data) ? data : []);
    } catch {
      // Silent fail – keep current data
    }
    setIsLoading(false);
    setIsRefreshing(false);
    setLastRefresh(new Date());
  }, []);

  // Initial fetch + auto-refresh every 30 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const openGoogleMaps = (lat: number, lng: number) => {
    window.open(
      `https://www.google.com/maps?q=${lat},${lng}`,
      "_blank",
      "noopener,noreferrer"
    );
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
            Mapa de Rastreamento
          </h1>
          <p className="text-muted-foreground">
            Acompanhe técnicos em campo em tempo real
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Atualizado {timeSince(lastRefresh.toISOString())}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>
      </motion.div>

      {/* Summary bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Técnicos em campo
                  </p>
                  <p className="text-lg font-bold">{technicians.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Navigation className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Em rota</p>
                  <p className="text-lg font-bold">
                    {
                      technicians.filter(
                        (t) => t.service_order?.status === "in_transit"
                      ).length
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <MapPin className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Em atendimento
                  </p>
                  <p className="text-lg font-bold">
                    {
                      technicians.filter(
                        (t) => t.service_order?.status === "in_progress"
                      ).length
                    }
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Technician Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <TechnicianCardSkeleton key={i} />
          ))}
        </div>
      ) : technicians.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card>
            <CardContent>
              <EmptyState
                icon={<MapPin className="h-6 w-6" />}
                title="Nenhum técnico em campo"
                description="Não há técnicos com ordens de serviço ativas no momento. Quando um técnico estiver em rota ou em atendimento, ele aparecerá aqui."
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {technicians.map((tech, index) => {
            const statusInfo = STATUS_MAP[tech.service_order?.status] || {
              label: tech.service_order?.status || "Ativo",
              variant: "gray",
            };
            const hasLocation =
              tech.latitude !== null && tech.longitude !== null;

            return (
              <motion.div
                key={tech.user_id}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.15 + index * 0.07, duration: 0.4 }}
              >
                <Card hover className="group relative overflow-hidden">
                  {/* Top accent based on status */}
                  <div
                    className={`absolute inset-x-0 top-0 h-[2px] ${
                      tech.service_order?.status === "in_transit"
                        ? "bg-amber-500"
                        : "bg-blue-500"
                    }`}
                  />

                  <CardContent className="p-6 space-y-4">
                    {/* Technician Header */}
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                        {tech.avatar_url ? (
                          <img
                            src={tech.avatar_url}
                            alt={tech.full_name}
                            className="h-12 w-12 rounded-xl object-cover"
                          />
                        ) : (
                          getInitials(tech.full_name || "??")
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold leading-snug">
                          {tech.full_name || "Técnico"}
                        </h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {tech.service_order?.title || "Sem OS vinculada"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          statusInfo.variant as
                            | "warning"
                            | "info"
                            | "gray"
                            | "success"
                            | "destructive"
                            | "purple"
                        }
                        size="sm"
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>

                    {/* Client */}
                    {tech.service_order?.client_name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                          <User className="h-3.5 w-3.5" />
                        </div>
                        <span className="truncate">
                          {tech.service_order.client_name}
                        </span>
                      </div>
                    )}

                    {/* Location Info */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        {hasLocation ? (
                          <span className="font-mono text-xs">
                            {formatCoord(tech.latitude)},{" "}
                            {formatCoord(tech.longitude)}
                          </span>
                        ) : (
                          <span className="text-xs italic">
                            Localização indisponível
                          </span>
                        )}
                      </div>

                      {tech.recorded_at && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                            <Clock className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs">
                            Última atualização: {timeSince(tech.recorded_at)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Google Maps Button */}
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!hasLocation}
                      onClick={() =>
                        hasLocation &&
                        openGoogleMaps(tech.latitude, tech.longitude)
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ver no Google Maps
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
