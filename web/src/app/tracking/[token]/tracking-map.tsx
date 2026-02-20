"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom marker icon
const technicianIcon = new L.DivIcon({
  html: `<div style="
    width: 40px; height: 40px; border-radius: 50%;
    background: #EAB308; border: 3px solid white;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    font-size: 18px;
  ">📍</div>`,
  className: "",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

interface TrackingMapProps {
  lat: number;
  lng: number;
  technicianName: string;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  in_transit: "Em Deslocamento",
  in_progress: "Em Atendimento",
};

export default function TrackingMap({
  lat,
  lng,
  technicianName,
  status,
}: TrackingMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      style={{ height: "100%", width: "100%", minHeight: "400px" }}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lng]} icon={technicianIcon}>
        <Popup>
          <div style={{ textAlign: "center", minWidth: 150 }}>
            <strong>{technicianName}</strong>
            <br />
            <span style={{ fontSize: 12, color: "#666" }}>
              {STATUS_LABELS[status] || status}
            </span>
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
