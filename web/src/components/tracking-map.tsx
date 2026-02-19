"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { type TechnicianLocation } from "@/lib/types";

// ============================================================
// Custom marker icons
// ============================================================

function createTechnicianIcon(status: string, isSelected: boolean): L.DivIcon {
  const color =
    status === "in_transit"
      ? "#f59e0b" // amber
      : "#3b82f6"; // blue

  const size = isSelected ? 40 : 32;
  const pulseSize = isSelected ? 60 : 0;

  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${
          isSelected
            ? `<div style="
                position:absolute;
                top:50%;left:50%;
                transform:translate(-50%,-50%);
                width:${pulseSize}px;height:${pulseSize}px;
                border-radius:50%;
                background:${color}20;
                border:2px solid ${color}40;
                animation:pulse 2s ease-in-out infinite;
              "></div>`
            : ""
        }
        <div style="
          position:absolute;
          top:50%;left:50%;
          transform:translate(-50%,-50%);
          width:${size}px;height:${size}px;
          border-radius:50%;
          background:${color};
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          <svg width="${size * 0.45}" height="${size * 0.45}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [isSelected ? 60 : 32, isSelected ? 60 : 32],
    iconAnchor: [isSelected ? 30 : 16, isSelected ? 30 : 16],
    popupAnchor: [0, isSelected ? -30 : -16],
  });
}

// ============================================================
// Auto-fit bounds when technicians change
// ============================================================

function FitBounds({
  technicians,
  selectedTechId,
}: {
  technicians: TechnicianLocation[];
  selectedTechId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedTechId) {
      const selected = technicians.find((t) => t.user_id === selectedTechId);
      if (selected && selected.latitude != null && selected.longitude != null) {
        map.flyTo([selected.latitude, selected.longitude], 15, {
          duration: 0.8,
        });
        return;
      }
    }

    const withLocation = technicians.filter(
      (t) => t.latitude != null && t.longitude != null
    );
    if (withLocation.length === 0) return;

    if (withLocation.length === 1) {
      map.flyTo(
        [withLocation[0].latitude, withLocation[0].longitude],
        14,
        { duration: 0.8 }
      );
    } else {
      const bounds = L.latLngBounds(
        withLocation.map((t) => [t.latitude, t.longitude] as [number, number])
      );
      map.flyToBounds(bounds, { padding: [50, 50], duration: 0.8 });
    }
  }, [technicians, selectedTechId, map]);

  return null;
}

// ============================================================
// Inject pulse animation CSS
// ============================================================

function InjectStyles() {
  useEffect(() => {
    const id = "tracking-map-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes pulse {
        0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 1; }
        50% { transform: translate(-50%,-50%) scale(1.3); opacity: 0.5; }
      }
      .custom-marker { background: transparent !important; border: none !important; }
      .leaflet-popup-content-wrapper {
        border-radius: 12px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
      }
      .leaflet-popup-content { margin: 8px 12px !important; }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}

// ============================================================
// Main component
// ============================================================

interface TrackingMapProps {
  technicians: TechnicianLocation[];
  selectedTechId: string | null;
  onSelectTech: (id: string | null) => void;
}

// Default center: Sao Paulo
const DEFAULT_CENTER: [number, number] = [-23.5505, -46.6333];
const DEFAULT_ZOOM = 11;

export default function TrackingMap({
  technicians,
  selectedTechId,
  onSelectTech,
}: TrackingMapProps) {
  const techsWithLocation = technicians.filter(
    (t) => t.latitude != null && t.longitude != null
  );

  const center: [number, number] =
    techsWithLocation.length > 0
      ? [techsWithLocation[0].latitude, techsWithLocation[0].longitude]
      : DEFAULT_CENTER;

  return (
    <div className="h-[500px] w-full">
      <InjectStyles />
      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full rounded-xl"
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds
          technicians={technicians}
          selectedTechId={selectedTechId}
        />

        {techsWithLocation.map((tech) => {
          const isSelected = selectedTechId === tech.user_id;
          const status = tech.service_order?.status || "active";

          return (
            <Marker
              key={tech.user_id}
              position={[tech.latitude, tech.longitude]}
              icon={createTechnicianIcon(status, isSelected)}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={{
                click: () => {
                  onSelectTech(isSelected ? null : tech.user_id);
                },
              }}
            >
              <Popup>
                <div className="min-w-[180px]">
                  <p className="font-semibold text-sm">
                    {tech.full_name || "Tecnico"}
                  </p>
                  {tech.service_order?.title && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      {tech.service_order.title}
                    </p>
                  )}
                  {tech.service_order?.client_name && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Cliente: {tech.service_order.client_name}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        background:
                          status === "in_transit" ? "#f59e0b" : "#3b82f6",
                      }}
                    />
                    <span className="text-xs">
                      {status === "in_transit"
                        ? "Em Rota"
                        : status === "in_progress"
                        ? "Em Atendimento"
                        : "Ativo"}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
