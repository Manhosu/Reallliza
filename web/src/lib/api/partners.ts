import { apiClient } from "./client";
import type { Partner, PaginatedResponse } from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface ListPartnersParams {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
}

export type CreatePartnerPayload = Omit<
  Partner,
  "id" | "user_id" | "is_active" | "created_at" | "updated_at"
>;

export type UpdatePartnerPayload = Partial<CreatePartnerPayload>;

// ============================================================
// API calls
// ============================================================

export const partnersApi = {
  list(params?: ListPartnersParams) {
    return apiClient.get<PaginatedResponse<Partner>>(
      "/partners",
      params as Record<string, unknown>
    );
  },

  getById(id: string) {
    return apiClient.get<Partner>(`/partners/${id}`);
  },

  create(data: CreatePartnerPayload) {
    return apiClient.post<Partner>("/partners", data);
  },

  update(id: string, data: UpdatePartnerPayload) {
    return apiClient.patch<Partner>(`/partners/${id}`, data);
  },

  activate(id: string) {
    return apiClient.patch<Partner>(`/partners/${id}/activate`);
  },

  deactivate(id: string) {
    return apiClient.patch<Partner>(`/partners/${id}/deactivate`);
  },
};
