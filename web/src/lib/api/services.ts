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

export interface ServicePhoto {
  url: string;
  thumbnail_url?: string | null;
  position?: number;
  alt_text?: string | null;
  storage_path?: string;
}

export interface Service {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  unit: string;
  commercial_price: number;
  /** Pode estar ausente pra role partner (servidor remove o campo). */
  payout_price?: number;
  /** Horas estimadas por unidade. Ex: 0.10 = 6min/m². */
  estimated_time_hours: number;
  photos: ServicePhoto[];
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
  estimated_time_hours?: number;
  photos?: ServicePhoto[];
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
  uploadPhoto(id: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post<Service>(`/services/${id}/photos`, form);
  },
  removePhoto(id: string, position: number) {
    return apiClient.delete<Service>(
      `/services/${id}/photos?position=${position}`
    );
  },
};
