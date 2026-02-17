import { apiClient } from "./client";
import type { AuditLog, PaginatedResponse } from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  date_from?: string;
  date_to?: string;
  action?: string;
  entity_type?: string;
  user_id?: string;
}

// ============================================================
// API calls
// ============================================================

export const auditApi = {
  search(params?: ListAuditLogsParams) {
    return apiClient.get<PaginatedResponse<AuditLog>>(
      "/audit",
      params as Record<string, unknown>
    );
  },

  getByEntity(type: string, id: string) {
    return apiClient.get<AuditLog[]>(`/audit/entity/${type}/${id}`);
  },
};
