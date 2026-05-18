import { apiClient } from "./client";

// ============================================================
// Categorias de serviço
// ============================================================

export interface ServiceCategory {
  id: string;
  name: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceCategoryPayload {
  name: string;
  description?: string | null;
  order_index?: number;
  is_active?: boolean;
}

export type UpdateServiceCategoryPayload = Partial<CreateServiceCategoryPayload>;

export const serviceCategoriesApi = {
  list(params?: { include_inactive?: boolean }) {
    return apiClient.get<ServiceCategory[]>(
      "/service-categories",
      params as Record<string, unknown>
    );
  },
  create(payload: CreateServiceCategoryPayload) {
    return apiClient.post<ServiceCategory>("/service-categories", payload);
  },
  update(id: string, payload: UpdateServiceCategoryPayload) {
    return apiClient.patch<ServiceCategory>(`/service-categories/${id}`, payload);
  },
  remove(id: string) {
    return apiClient.delete<{ success: true }>(`/service-categories/${id}`);
  },
};

// ============================================================
// Catálogo de serviços
// ============================================================

export interface Service {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  unit: string;
  commercial_price: number;
  payout_price: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category: { id: string; name: string } | null;
}

export interface CreateServicePayload {
  name: string;
  description?: string | null;
  category_id?: string | null;
  unit?: string;
  commercial_price?: number;
  payout_price?: number;
  is_active?: boolean;
}

export type UpdateServicePayload = Partial<CreateServicePayload>;

export const servicesApi = {
  list(params?: {
    include_inactive?: boolean;
    category_id?: string;
    search?: string;
  }) {
    return apiClient.get<Service[]>(
      "/services",
      params as Record<string, unknown>
    );
  },
  getById(id: string) {
    return apiClient.get<Service>(`/services/${id}`);
  },
  create(payload: CreateServicePayload) {
    return apiClient.post<Service>("/services", payload);
  },
  update(id: string, payload: UpdateServicePayload) {
    return apiClient.patch<Service>(`/services/${id}`, payload);
  },
  remove(id: string) {
    return apiClient.delete<{ success: true }>(`/services/${id}`);
  },
};
