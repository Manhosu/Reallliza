import { apiClient } from "./client";
import type {
  ServiceOrder,
  OsStatus,
  OsPriority,
  OsStatusHistory,
  PaginatedResponse,
} from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface ListServiceOrdersParams {
  page?: number;
  limit?: number;
  status?: OsStatus;
  priority?: OsPriority;
  partner_id?: string;
  technician_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export type CreateServiceOrderPayload = Omit<
  ServiceOrder,
  | "id"
  | "order_number"
  | "status"
  | "created_by"
  | "started_at"
  | "completed_at"
  | "created_at"
  | "updated_at"
>;

export type UpdateServiceOrderPayload = Partial<CreateServiceOrderPayload>;

// ============================================================
// API calls
// ============================================================

export const serviceOrdersApi = {
  list(params?: ListServiceOrdersParams) {
    return apiClient.get<PaginatedResponse<ServiceOrder>>(
      "/service-orders",
      params as Record<string, unknown>
    );
  },

  getById(id: string) {
    return apiClient.get<ServiceOrder>(`/service-orders/${id}`);
  },

  create(data: CreateServiceOrderPayload) {
    return apiClient.post<ServiceOrder>("/service-orders", data);
  },

  update(id: string, data: UpdateServiceOrderPayload) {
    return apiClient.put<ServiceOrder>(`/service-orders/${id}`, data);
  },

  changeStatus(id: string, status: OsStatus, notes?: string) {
    return apiClient.patch<ServiceOrder>(
      `/service-orders/${id}/status`,
      { status, notes }
    );
  },

  getTimeline(id: string) {
    return apiClient.get<OsStatusHistory[]>(
      `/service-orders/${id}/timeline`
    );
  },
};
