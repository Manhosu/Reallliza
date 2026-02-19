import { apiClient } from "./client";
import type { ProfessionalRating, PaginatedResponse } from "@/lib/types";

// ============================================================
// API calls
// ============================================================

export const ratingsApi = {
  list(params?: { page?: number; limit?: number; professional_id?: string }) {
    return apiClient.get<PaginatedResponse<ProfessionalRating>>(
      "/ratings",
      params as Record<string, unknown>
    );
  },

  getByProfessional(userId: string) {
    return apiClient.get<{
      ratings: ProfessionalRating[];
      averages: Record<string, number>;
      total: number;
    }>(`/ratings/professional/${userId}`);
  },

  create(data: {
    professional_id: string;
    service_order_id?: string;
    quality_score: number;
    punctuality_score: number;
    organization_score: number;
    communication_score: number;
    notes?: string;
  }) {
    return apiClient.post<ProfessionalRating>("/ratings", data);
  },
};
