import { apiClient, getAccessToken, BASE_URL, ApiError } from "./client";
import type {
  ToolInventory,
  ToolCustody,
  ToolStatus,
  ToolCondition,
  PaginatedResponse,
} from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface ListToolsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ToolStatus;
  category?: string;
}

export type CreateToolPayload = Omit<
  ToolInventory,
  "id" | "status" | "created_at" | "updated_at"
>;

export type UpdateToolPayload = Partial<CreateToolPayload> & {
  status?: ToolStatus;
};

export interface CheckoutToolPayload {
  user_id: string;
  service_order_id?: string;
  condition_out: ToolCondition;
  notes?: string;
}

export interface CheckinToolPayload {
  condition_in: ToolCondition;
  notes?: string;
}

// ============================================================
// API calls
// ============================================================

export const toolsApi = {
  list(params?: ListToolsParams) {
    return apiClient.get<PaginatedResponse<ToolInventory>>(
      "/tools",
      params as Record<string, unknown>
    );
  },

  getById(id: string) {
    return apiClient.get<ToolInventory>(`/tools/${id}`);
  },

  create(data: CreateToolPayload) {
    return apiClient.post<ToolInventory>("/tools", data);
  },

  update(id: string, data: UpdateToolPayload) {
    return apiClient.put<ToolInventory>(`/tools/${id}`, data);
  },

  checkout(toolId: string, data: CheckoutToolPayload) {
    return apiClient.post<ToolCustody>(
      `/tools/${toolId}/checkout`,
      data
    );
  },

  checkin(custodyId: string, data: CheckinToolPayload) {
    return apiClient.post<ToolCustody>(
      `/tools/custody/${custodyId}/checkin`,
      data
    );
  },

  getActiveCustodies() {
    return apiClient.get<ToolCustody[]>("/tools/custody/active");
  },

  getCustodyHistory(toolId: string) {
    return apiClient.get<ToolCustody[]>(
      `/tools/${toolId}/history`
    );
  },

  /** Faz upload de uma foto da ferramenta usando o endpoint /api/feed/upload (bucket photos) */
  async uploadPhoto(file: File): Promise<string> {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}/feed/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      if (!res.ok) throw new ApiError(res.status, res.statusText);
      throw new ApiError(res.status, "Upload retornou resposta invalida");
    }

    if (!res.ok) {
      const errorBody = data as Record<string, unknown> | undefined;
      const message =
        (errorBody?.message as string) ||
        (errorBody?.error as string) ||
        res.statusText;
      throw new ApiError(res.status, message, errorBody);
    }

    return (data as { url: string }).url;
  },
};
