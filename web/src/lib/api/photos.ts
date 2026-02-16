import { apiClient, ApiError, BASE_URL, getAccessToken } from "./client";
import type { Photo, PhotoType } from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface UploadPhotoData {
  service_order_id: string;
  type: PhotoType;
  description?: string;
  geo_lat?: number;
  geo_lng?: number;
}

export interface PhotoCountResponse {
  total: number;
  before: number;
  during: number;
  after: number;
  issue: number;
  signature: number;
}

// ============================================================
// API calls
// ============================================================

export const photosApi = {
  getByServiceOrder(serviceOrderId: string, type?: PhotoType) {
    return apiClient.get<Photo[]>(
      `/service-orders/${serviceOrderId}/photos`,
      type ? ({ type } as Record<string, unknown>) : undefined
    );
  },

  getById(id: string) {
    return apiClient.get<Photo>(`/photos/${id}`);
  },

  async upload(file: File, data: UploadPhotoData): Promise<Photo> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("service_order_id", data.service_order_id);
    formData.append("type", data.type);
    if (data.description) formData.append("description", data.description);
    if (data.geo_lat != null)
      formData.append("geo_lat", String(data.geo_lat));
    if (data.geo_lng != null)
      formData.append("geo_lng", String(data.geo_lng));

    // Use fetch directly for FormData (don't set Content-Type, browser sets
    // it with the correct multipart boundary)
    const token = await getAccessToken();

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}/photos/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (!res.ok) {
        throw new ApiError(res.status, res.statusText);
      }
      throw new ApiError(res.status, "Unexpected empty response");
    }

    if (!res.ok) {
      const errorBody = body as Record<string, unknown> | undefined;
      const message =
        (errorBody?.message as string) ||
        (errorBody?.error as string) ||
        res.statusText;
      throw new ApiError(res.status, message, errorBody);
    }

    return body as Photo;
  },

  delete(id: string) {
    return apiClient.delete<void>(`/photos/${id}`);
  },

  getCountByServiceOrder(serviceOrderId: string) {
    return apiClient.get<PhotoCountResponse>(
      `/service-orders/${serviceOrderId}/photos/count`
    );
  },
};
