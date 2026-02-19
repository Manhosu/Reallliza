import { apiClient } from "./client";
import type { TechnicianLocation } from "@/lib/types";

// ============================================================
// API calls
// ============================================================

export const trackingApi = {
  getTechnicians() {
    return apiClient.get<TechnicianLocation[]>("/tracking/technicians");
  },

  sendLocation(data: {
    service_order_id?: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
  }) {
    return apiClient.post("/tracking/location", data);
  },
};
