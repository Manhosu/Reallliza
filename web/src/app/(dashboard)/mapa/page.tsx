"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  MapPin,
  Navigation,
  Clock,
  ExternalLink,
  RefreshCw,
  User,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { trackingApi } from "@/lib/api";
import { type TechnicianLocation } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole } from "@/lib/types";
import nextDynamic from "next/dynamic";

// Lazy load the map component to avoid SSR issues with Leaflet
const TrackingMap = nextDynamic(() => import("@/components/tracking-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-xl border bg-muted/30">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <MapPin className="h-8 w-8 animate-pulse" />
        <span className="text-sm">Carregando mapa...</span>
      </div>
    </div>
  ),
});

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
  if (diffSecs < 60) return `${diffSecs}s atras`;

  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}min atras`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h atras`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d atras`;
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
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
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
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);

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
      // Silent fail - keep current data
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

  const techsWithLocation = useMemo(
    () => technicians.filter((t) => t.latitude != null && t.longitude != null),
    [technicians]
  );

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
            Acompanhe tecnicos em campo em tempo real
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
                    Tecnicos em campo
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

      {/* Map + Sidebar Layout */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-[500px] rounded-xl" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <TechnicianCardSkeleton key={i} />
            ))}
          </div>
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
                title="Nenhum tecnico em campo"
                description="Nao ha tecnicos com ordens de servico ativas no momento. Quando um tecnico estiver em rota ou em atendimento, ele aparecera aqui."
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]"
        >
          {/* Map */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <TrackingMap
                technicians={technicians}
                selectedTechId={selectedTechId}
                onSelectTech={setSelectedTechId}
              />
            </CardContent>
          </Card>

          {/* Sidebar - Technician list */}
          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {technicians.map((tech) => {
              const statusInfo = STATUS_MAP[tech.service_order?.status] || {
                label: tech.service_order?.status || "Ativo",
                variant: "gray",
              };
              const hasLocation =
                tech.latitude != null && tech.longitude != null;
              const isSelected = selectedTechId === tech.user_id;

              return (
                <Card
                  key={tech.user_id}
                  hover
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? "ring-2 ring-primary shadow-md"
                      : "hover:shadow-sm"
                  }`}
                  onClick={() =>
                    setSelectedTechId(
                      isSelected ? null : tech.user_id
                    )
                  }
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        {tech.avatar_url ? (
                          <img
                            src={tech.avatar_url}
                            alt={tech.full_name}
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        ) : (
                          getInitials(tech.full_name || "??")
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold">
                          {tech.full_name || "Tecnico"}
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

                    {/* Details */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {tech.recorded_at
                          ? timeSince(tech.recorded_at)
                          : "Sem registro"}
                      </div>
                      {tech.service_order?.client_name && (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          <span className="truncate max-w-[120px]">
                            {tech.service_order.client_name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions (visible when selected) */}
                    {isSelected && hasLocation && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGoogleMaps(tech.latitude, tech.longitude);
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir no Google Maps
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
