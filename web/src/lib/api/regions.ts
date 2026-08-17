import { apiClient } from "./client";

export interface Region {
  id: string;
  name: string;
  uf: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRegionPayload {
  name: string;
  uf: string;
  is_active?: boolean;
}

export type UpdateRegionPayload = Partial<CreateRegionPayload>;

export const regionsApi = {
  list(params?: { include_inactive?: boolean }) {
    return apiClient.get<Region[]>(
      "/regions",
      params as Record<string, unknown>
    );
  },
  create(payload: CreateRegionPayload) {
    return apiClient.post<Region>("/regions", payload);
  },
  update(id: string, payload: UpdateRegionPayload) {
    return apiClient.patch<Region>(`/regions/${id}`, payload);
  },
  /** Desativa. O nome engana: a rota DELETE do recurso faz `is_active=false`. */
  remove(id: string) {
    return apiClient.delete<{ success: true }>(`/regions/${id}`);
  },
  /** Apaga de verdade. A rota existe desde julho e nenhuma tela chamava. */
  purge(id: string) {
    return apiClient.delete<{ success: true }>(`/regions/${id}/purge`);
  },
};
