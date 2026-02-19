import { apiClient } from "./client";
import type { FeedPost, PaginatedResponse } from "@/lib/types";

// ============================================================
// API calls
// ============================================================

export const feedApi = {
  list(params?: { page?: number; limit?: number }) {
    return apiClient.get<PaginatedResponse<FeedPost>>(
      "/feed",
      params as Record<string, unknown>
    );
  },

  get(id: string) {
    return apiClient.get<FeedPost>(`/feed/${id}`);
  },

  create(data: {
    title: string;
    content: string;
    media_urls?: string[];
    audience?: string;
    is_pinned?: boolean;
  }) {
    return apiClient.post<FeedPost>("/feed", data);
  },

  update(id: string, data: Partial<FeedPost>) {
    return apiClient.put<FeedPost>(`/feed/${id}`, data);
  },

  delete(id: string) {
    return apiClient.delete(`/feed/${id}`);
  },
};
