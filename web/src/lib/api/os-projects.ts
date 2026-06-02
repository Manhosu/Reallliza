import { apiClient, ApiError, BASE_URL, getAccessToken } from "./client";

export interface OsProject {
  id: string;
  service_order_id: string;
  uploaded_by: string;
  file_url: string;
  file_name: string | null;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
}

export const osProjectsApi = {
  list(serviceOrderId: string) {
    return apiClient.get<OsProject[]>("/os-projects", {
      service_order_id: serviceOrderId,
    });
  },

  async upload(file: File, serviceOrderId: string): Promise<OsProject> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("service_order_id", serviceOrderId);

    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}/os-projects`, {
      method: "POST",
      headers,
      body: formData,
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (!res.ok) throw new ApiError(res.status, res.statusText);
      throw new ApiError(res.status, "Unexpected empty response");
    }

    if (!res.ok) {
      const eb = body as Record<string, unknown> | undefined;
      throw new ApiError(
        res.status,
        (eb?.message as string) || (eb?.error as string) || res.statusText,
        eb
      );
    }

    return body as OsProject;
  },

  delete(id: string) {
    return apiClient.delete<{ success: true }>(`/os-projects/${id}`);
  },
};
