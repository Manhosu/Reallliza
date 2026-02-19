import { apiClient } from "./client";
import type { ServiceProposal, PaginatedResponse } from "@/lib/types";

// ============================================================
// API calls
// ============================================================

export const proposalsApi = {
  list(params?: {
    page?: number;
    limit?: number;
    service_order_id?: string;
    status?: string;
  }) {
    return apiClient.get<PaginatedResponse<ServiceProposal>>(
      "/proposals",
      params as Record<string, unknown>
    );
  },

  create(data: {
    service_order_id: string;
    partner_id: string;
    proposed_value?: number;
    message?: string;
    expires_at?: string;
  }) {
    return apiClient.post<ServiceProposal>("/proposals", data);
  },

  respond(
    id: string,
    data: { action: "accept" | "reject"; response_message?: string }
  ) {
    return apiClient.post(`/proposals/${id}/respond`, data);
  },
};
