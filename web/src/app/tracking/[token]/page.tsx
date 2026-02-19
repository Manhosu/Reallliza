"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { MapPin, Navigation, User, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface TrackingData {
  status: "not_tracking" | "in_transit" | "in_progress";
  technician_name?: string | null;
  technician_avatar?: string | null;
  client_name?: string | null;
  latest_location?: { lat: number; lng: number } | null;
  estimated_arrival?: string | null;
}

// ============================================================
// Status helpers
// ============================================================

const STATUS_MAP: Record<string, { label: string; color: string; bgColor: string; icon: typeof Navigation }> = {
  in_transit: {
    label: "Em deslocamento",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    icon: Navigation,
  },
  in_progress: {
    label: "Em atendimento",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    icon: Clock,
  },
};

// ============================================================
// Component: Initials Avatar
// ============================================================

function InitialsAvatar({ name }: { name: string | null | undefined }) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "T";

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-600 ring-4 ring-white shadow-lg">
      {initials}
    </div>
  );
}

// ============================================================
// Component: Pulse Dot (live indicator)
// ============================================================

function PulseDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
    </span>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function TrackingPage() {
  const params = useParams();
  const token = params.token as string;

  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ----------------------------------------------------------
  // Fetch tracking data
  // ----------------------------------------------------------

  const fetchTracking = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const res = await fetch(`/api/tracking/${token}`);
        const data = await res.json();
        setTrackingData(data);
        setLastUpdated(new Date());
        setError(false);
      } catch {
        setError(true);
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [token]
  );

  // Initial fetch
  useEffect(() => {
    if (token) fetchTracking();
  }, [token, fetchTracking]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      fetchTracking(true);
    }, 15_000);

    return () => clearInterval(interval);
  }, [token, fetchTracking]);

  // ----------------------------------------------------------
  // Google Maps link
  // ----------------------------------------------------------

  const googleMapsUrl =
    trackingData?.latest_location
      ? `https://www.google.com/maps?q=${trackingData.latest_location.lat},${trackingData.latest_location.lng}`
      : null;

  // ----------------------------------------------------------
  // Status info
  // ----------------------------------------------------------

  const statusInfo =
    trackingData && trackingData.status !== "not_tracking"
      ? STATUS_MAP[trackingData.status]
      : null;

  const StatusIcon = statusInfo?.icon ?? Navigation;

  // ----------------------------------------------------------
  // Render: Loading
  // ----------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Render: Error
  // ----------------------------------------------------------

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <MapPin className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            Erro ao carregar
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Nao foi possivel carregar as informacoes de rastreamento. Tente
            novamente.
          </p>
          <button
            onClick={() => fetchTracking()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Render: Not Tracking
  // ----------------------------------------------------------

  if (!trackingData || trackingData.status === "not_tracking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          {/* Brand */}
          <div className="mx-auto mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <span className="text-lg font-bold text-white">R</span>
          </div>

          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <Navigation className="h-7 w-7 text-gray-400" />
          </div>

          <h1 className="text-lg font-semibold text-gray-900">
            Acompanhamento nao disponivel
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            O tecnico ainda nao iniciou o deslocamento ou o servico ja foi
            concluido.
          </p>

          <div className="mt-8 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">Reallliza Revestimentos</p>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Render: Active Tracking
  // ----------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <span className="text-sm font-bold text-white">R</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              Reallliza
            </span>
          </div>

          <div className="flex items-center gap-2">
            <PulseDot />
            <span className="text-xs font-medium text-gray-500">Ao vivo</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col items-center px-4 py-6">
        <div className="w-full max-w-lg space-y-4">
          {/* Technician Card */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              {/* Avatar */}
              <InitialsAvatar name={trackingData.technician_name} />

              {/* Name */}
              <h2 className="mt-4 text-lg font-semibold text-gray-900">
                {trackingData.technician_name || "Tecnico"}
              </h2>

              {/* Status Badge */}
              {statusInfo && (
                <div
                  className={cn(
                    "mt-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5",
                    statusInfo.bgColor
                  )}
                >
                  <StatusIcon className={cn("h-4 w-4", statusInfo.color)} />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      statusInfo.color
                    )}
                  >
                    {statusInfo.label}
                  </span>
                </div>
              )}

              {/* Client name */}
              {trackingData.client_name && (
                <p className="mt-4 text-sm text-gray-500">
                  Servico para{" "}
                  <span className="font-medium text-gray-700">
                    {trackingData.client_name}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Estimated Arrival */}
          {trackingData.estimated_arrival && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    Previsao de chegada
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {new Date(trackingData.estimated_arrival).toLocaleTimeString(
                      "pt-BR",
                      { hour: "2-digit", minute: "2-digit" }
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Location Button */}
          {googleMapsUrl ? (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
              <MapPin className="h-5 w-5" />
              Ver localizacao no mapa
            </a>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4 text-center">
              <MapPin className="mx-auto h-5 w-5 text-gray-300" />
              <p className="mt-1.5 text-xs text-gray-400">
                Localizacao ainda nao disponivel
              </p>
            </div>
          )}

          {/* Last Update Info */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 text-gray-400",
                isRefreshing && "animate-spin"
              )}
            />
            <p className="text-xs text-gray-400">
              {lastUpdated
                ? `Atualizado as ${lastUpdated.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : "Atualizando..."}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white px-4 py-4">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-xs text-gray-400">
            Acompanhamento em tempo real
          </p>
          <p className="mt-0.5 text-xs font-medium text-gray-500">
            Reallliza Revestimentos
          </p>
        </div>
      </footer>
    </div>
  );
}
