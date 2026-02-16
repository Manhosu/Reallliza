import { apiClient } from "./client";
import type { Notification, PaginatedResponse } from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

// ============================================================
// API calls
// ============================================================

export const notificationsApi = {
  list(params?: ListNotificationsParams) {
    return apiClient.get<PaginatedResponse<Notification>>(
      "/notifications",
      params as Record<string, unknown>
    );
  },

  getUnreadCount() {
    return apiClient.get<UnreadCountResponse>(
      "/notifications/unread-count"
    );
  },

  markAsRead(id: string) {
    return apiClient.patch<void>(`/notifications/${id}/read`);
  },

  markAllAsRead() {
    return apiClient.patch<void>("/notifications/read-all");
  },
};
