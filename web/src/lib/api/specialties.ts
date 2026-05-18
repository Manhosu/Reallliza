import { apiClient } from "./client";

export interface SpecialtyChecklistItem {
  id: string;
  specialty_id: string;
  label: string;
  weight: number;
  order_index: number;
  is_active: boolean;
  created_at: string;
}

export interface Specialty {
  id: string;
  name: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  checklist: SpecialtyChecklistItem[];
}

export interface CreateSpecialtyPayload {
  name: string;
  description?: string | null;
  order_index?: number;
  is_active?: boolean;
}

export type UpdateSpecialtyPayload = Partial<CreateSpecialtyPayload>;

export interface ChecklistItemPayload {
  id?: string;
  label: string;
  weight?: number;
  order_index?: number;
}

export const specialtiesApi = {
  list(params?: { include_inactive?: boolean }) {
    return apiClient.get<Specialty[]>(
      "/specialties",
      params as Record<string, unknown>
    );
  },
  create(payload: CreateSpecialtyPayload) {
    return apiClient.post<Specialty>("/specialties", payload);
  },
  update(id: string, payload: UpdateSpecialtyPayload) {
    return apiClient.patch<Specialty>(`/specialties/${id}`, payload);
  },
  remove(id: string) {
    return apiClient.delete<{ success: true }>(`/specialties/${id}`);
  },
  getChecklist(id: string) {
    return apiClient.get<SpecialtyChecklistItem[]>(
      `/specialties/${id}/checklist`
    );
  },
  saveChecklist(id: string, items: ChecklistItemPayload[]) {
    return apiClient.patch<SpecialtyChecklistItem[]>(
      `/specialties/${id}/checklist`,
      { items }
    );
  },
};
