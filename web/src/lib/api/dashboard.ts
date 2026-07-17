import { apiClient } from "./client";
import type { OsStatusHistory, Schedule } from "@/lib/types";

// ============================================================
// Response types
// ============================================================

export interface OsBucketStats {
  openOs: number;
  inProgressOs: number;
  completedOs: number;
  overdueOs: number;
}

export interface DashboardStats extends OsBucketStats {
  // Segregado por executor (admin) — Jessica 17/07
  reallliza?: OsBucketStats | null;
  homologados?: OsBucketStats | null;
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
