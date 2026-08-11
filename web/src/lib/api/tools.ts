import { apiClient, getAccessToken, BASE_URL, ApiError } from "./client";
import type {
  ToolInventory,
  ToolCustody,
  ToolStatus,
  ToolCondition,
  PaginatedResponse,
} from "@/lib/types";
import type { ToolUnit, ToolEvent } from "@/lib/tools/types";

/** Resposta de GET /tools/dashboard (spec seção 4). */
export interface ToolsDashboard {
  indicators: {
    available: number;
    reserved: number;
    separating: number;
    awaiting_pickup: number;
    /** Custódias ativas (cobre unidade e quantidade). */
    in_custody: number;
    /** Só unidades físicas com status in_custody. */
    in_custody_units: number;
    return_requested: number;
    due_today: number;
    overdue: number;
    maintenance: number;
    damage_reported: number;
    extension_pending: number;
    pending_requests: number;
  };
  totals: {
    units: number;
    damaged: number;
    missing: number;
    retired: number;
    active_custody: number;
  };
  blocks: Record<string, Array<Record<string, unknown>>>;
}

/** Resposta de GET /tools/search (spec seções 5-7). */
export interface ToolsSearchResult {
  query: string;
  total: number;
  exact_unit_id: string | null;
  results: {
    units: Array<Record<string, unknown>>;
    tools: Array<Record<string, unknown>>;
    technicians: Array<Record<string, unknown>>;
    service_orders: Array<Record<string, unknown>>;
  };
}

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

  purge(id: string) {
    return apiClient.delete<{ success: true; id: string }>(
      `/tools/${id}/purge`
    );
  },

  // Aditivo Jessica 28/07: fluxo do operador
  patchRequest(
    id: string,
    body: {
      action:
        | "approve"
        | "reject"
        | "separate"
        | "ready"
        | "deliver"
        | "cancel";
      rejection_reason?: string;
      tool_id?: string;
      condition_out?: string;
      notes_out?: string;
      photos_out?: Array<{ url: string; name: string; storage_path?: string }>;
    }
  ) {
    return apiClient.patch<{ request: unknown }>(
      `/tools/requests/${id}`,
      body
    );
  },

  listMaintenance(params?: { tool_id?: string; pending?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.tool_id) qs.set("tool_id", params.tool_id);
    if (params?.pending) qs.set("pending", "1");
    const q = qs.toString();
    return apiClient.get<
      Array<{
        id: string;
        tool_id: string;
        reason: string;
        sent_at: string;
        expected_return_at: string | null;
        actual_return_at: string | null;
        estimated_cost: number | null;
        final_cost: number | null;
        notes: string | null;
        outcome: string | null;
        tool?: { id: string; name: string; serial_number?: string };
        responsible?: { id: string; full_name: string };
      }>
    >(`/tools/maintenance${q ? "?" + q : ""}`);
  },

  sendToMaintenance(body: {
    tool_id: string;
    reason: string;
    expected_return_at?: string;
    estimated_cost?: number;
    notes?: string;
    responsible_id?: string;
    photos?: Array<{ url: string; name: string; storage_path?: string }>;
  }) {
    return apiClient.post("/tools/maintenance", body);
  },

  finishMaintenance(
    id: string,
    body: {
      outcome: "returned_available" | "retired";
      final_cost?: number;
      outcome_notes?: string;
    }
  ) {
    return apiClient.patch(`/tools/maintenance/${id}`, body);
  },

  listRetirements() {
    return apiClient.get<
      Array<{
        id: string;
        tool_id: string;
        reason: string;
        notes: string | null;
        retired_at: string;
        tool?: { id: string; name: string; serial_number?: string };
        responsible?: { id: string; full_name: string };
      }>
    >("/tools/retirements");
  },

  retire(body: {
    tool_id: string;
    reason: string;
    notes?: string;
    photos?: Array<{ url: string; name: string; storage_path?: string }>;
  }) {
    return apiClient.post("/tools/retirements", body);
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

  // ============================================================
  // Modelo novo — unidades físicas, histórico e prazos (spec 06/08)
  // ============================================================

  /** Unidades físicas. `available_for` aplica a regra da seção 12. */
  listUnits(params?: {
    tool_id?: string;
    status?: string;
    search?: string;
    location?: string;
    available_for?: string;
    page?: number;
    limit?: number;
  }) {
    return apiClient.get<PaginatedResponse<ToolUnit>>(
      "/tools/units",
      params as Record<string, unknown>
    );
  },

  createUnit(body: Partial<ToolUnit> & { tool_id: string; code: string }) {
    return apiClient.post<ToolUnit>("/tools/units", body);
  },

  getUnit(id: string) {
    return apiClient.get<ToolUnit & { current_custody: unknown; summary: unknown }>(
      `/tools/units/${id}`
    );
  },

  updateUnit(id: string, body: Partial<ToolUnit> & { reason?: string }) {
    return apiClient.patch<ToolUnit>(`/tools/units/${id}`, body);
  },

  /** Timeline permanente da unidade (seções 23-27). */
  getUnitHistory(
    id: string,
    params?: {
      from?: string;
      to?: string;
      technician_id?: string;
      service_order_id?: string;
      event_type?: string;
      order?: "asc" | "desc";
    }
  ) {
    return apiClient.get<ToolEvent[]>(
      `/tools/units/${id}/history`,
      params as Record<string, unknown>
    );
  },

  /** Indicadores e blocos do dashboard (seção 4). */
  getDashboard() {
    return apiClient.get<ToolsDashboard>("/tools/dashboard");
  },

  /** Pesquisa global (seções 5-7). */
  globalSearch(q: string) {
    return apiClient.get<ToolsSearchResult>("/tools/search", { q });
  },

  /** O técnico avisa que quer devolver — não encerra a custódia (seção 4). */
  requestReturn(custodyId: string, notes?: string) {
    return apiClient.post(`/tools/custody/${custodyId}/request-return`, { notes });
  },

  reportDamage(
    custodyId: string,
    body: { description: string; photos?: Array<{ url: string; name: string }> }
  ) {
    return apiClient.post(`/tools/custody/${custodyId}/report-damage`, body);
  },

  requestExtension(
    custodyId: string,
    body: { requested_return_at: string; justification?: string }
  ) {
    return apiClient.post(`/tools/custody/${custodyId}/extension`, body);
  },

  decideExtension(
    custodyId: string,
    body: {
      action: "approve" | "reject";
      approved_return_at?: string;
      decision_notes?: string;
    }
  ) {
    return apiClient.patch(`/tools/custody/${custodyId}/extension`, body);
  },
};
