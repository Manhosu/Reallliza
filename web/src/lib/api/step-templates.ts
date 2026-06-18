import { apiClient } from "./client";

export interface StepTemplateItem {
  id: string;
  group_id: string;
  step_key: string;
  name: string;
  description: string | null;
  order_index: number;
  photos_required_min: number;
  final_photos_required_min: number;
  occurrence_enabled: boolean;
  is_required: boolean;
  /** Minutos de cura/secagem que o técnico precisa aguardar após
   *  concluir esta etapa antes da próxima destravar. 0 = libera imediato. */
  wait_time_minutes: number;
}

export interface StepTemplateGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items: StepTemplateItem[];
}

export interface StepTemplateItemPayload {
  id?: string;
  step_key?: string;
  name: string;
  description?: string | null;
  order_index: number;
  photos_required_min?: number;
  final_photos_required_min?: number;
  occurrence_enabled?: boolean;
  is_required?: boolean;
  /** Minutos de cura/secagem após esta etapa (default 0). */
  wait_time_minutes?: number;
}

export interface CreateStepTemplatePayload {
  name: string;
  description?: string;
  is_active?: boolean;
  items: StepTemplateItemPayload[];
}

export interface UpdateStepTemplatePayload {
  name?: string;
  description?: string;
  is_active?: boolean;
  items?: StepTemplateItemPayload[];
}

export const stepTemplatesApi = {
  list(params?: { include_inactive?: boolean; search?: string }) {
    return apiClient.get<StepTemplateGroup[]>(
      "/step-templates",
      params as Record<string, unknown>
    );
  },
  getById(id: string) {
    return apiClient.get<StepTemplateGroup>(`/step-templates/${id}`);
  },
  create(payload: CreateStepTemplatePayload) {
    return apiClient.post<StepTemplateGroup>("/step-templates", payload);
  },
  update(id: string, payload: UpdateStepTemplatePayload) {
    return apiClient.patch<StepTemplateGroup>(`/step-templates/${id}`, payload);
  },
  remove(id: string) {
    return apiClient.delete<{ success: true }>(`/step-templates/${id}`);
  },
  provision(serviceOrderId: string, stepTemplateGroupId?: string) {
    return apiClient.post<{ success: true; created: number }>(
      `/service-orders/${serviceOrderId}/provision-steps`,
      stepTemplateGroupId ? { step_template_group_id: stepTemplateGroupId } : {}
    );
  },
};
