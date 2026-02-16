import { apiClient } from "./client";
import type { OsStatusHistory, Schedule } from "@/lib/types";

// ============================================================
// Response types
// ============================================================

export interface DashboardStats {
  openOs: number;
  inProgressOs: number;
  completedOs: number;
  overdueOs: number;
}

export interface OsPerMonth {
  month: string;
  count: number;
}

// ============================================================
// API calls
// ============================================================

export const dashboardApi = {
  getStats() {
    return apiClient.get<DashboardStats>("/dashboard/stats");
  },

  getOsPerMonth() {
    return apiClient.get<OsPerMonth[]>("/dashboard/os-per-month");
  },

  getRecentActivity() {
    return apiClient.get<OsStatusHistory[]>(
      "/dashboard/recent-activity"
    );
  },

  getUpcomingSchedules() {
    return apiClient.get<Schedule[]>(
      "/dashboard/upcoming-schedules"
    );
  },
};
