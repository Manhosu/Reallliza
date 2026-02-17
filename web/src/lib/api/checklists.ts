import { apiClient } from "./client";
import type {
  Checklist,
  ChecklistItem,
  ChecklistTemplate,
  PaginatedResponse,
} from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface ListTemplatesParams {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
}

export interface CreateTemplatePayload {
  name: string;
  description?: string;
  items: { label: string; required: boolean; order: number }[];
}

export type UpdateTemplatePayload = Partial<CreateTemplatePayload>;

export interface CreateChecklistFromTemplatePayload {
  service_order_id: string;
  template_id: string;
}

// ============================================================
// Template API calls
// ============================================================

export const checklistTemplatesApi = {
  list(params?: ListTemplatesParams) {
    return apiClient.get<PaginatedResponse<ChecklistTemplate>>(
      "/checklists/templates",
      params as Record<string, unknown>
    );
  },

  getById(id: string) {
    return apiClient.get<ChecklistTemplate>(`/checklists/templates/${id}`);
  },

  create(data: CreateTemplatePayload) {
    return apiClient.post<ChecklistTemplate>("/checklists/templates", data);
  },

  update(id: string, data: UpdateTemplatePayload) {
    return apiClient.put<ChecklistTemplate>(
      `/checklists/templates/${id}`,
      data
    );
  },

  deactivate(id: string) {
    return apiClient.patch<void>(`/checklists/templates/${id}/deactivate`, {});
  },
};

// ============================================================
// Checklist API calls
// ============================================================

export const checklistsApi = {
  getByServiceOrder(serviceOrderId: string) {
    return apiClient.get<Checklist[]>(
      `/service-orders/${serviceOrderId}/checklists`
    );
  },

  getById(id: string) {
    return apiClient.get<Checklist>(`/checklists/${id}`);
  },

  createFromTemplate(data: CreateChecklistFromTemplatePayload) {
    return apiClient.post<Checklist>("/checklists", data);
  },

  updateItems(id: string, items: ChecklistItem[]) {
    return apiClient.put<Checklist>(`/checklists/${id}/items`, { items });
  },

  complete(id: string) {
    return apiClient.patch<Checklist>(`/checklists/${id}/complete`, {});
  },
};
