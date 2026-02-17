import { apiClient } from "./client";
import type {
  Profile,
  UserRole,
  UserStatus,
  PaginatedResponse,
} from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface ListUsersParams {
  page?: number;
  limit?: number;
  role?: UserRole;
  status?: UserStatus;
  search?: string;
}

export type UpdateUserPayload = Partial<
  Omit<Profile, "id" | "created_at" | "updated_at" | "email">
>;

// ============================================================
// API calls
// ============================================================

export const usersApi = {
  list(params?: ListUsersParams) {
    return apiClient.get<PaginatedResponse<Profile>>(
      "/users",
      params as Record<string, unknown>
    );
  },

  getById(id: string) {
    return apiClient.get<Profile>(`/users/${id}`);
  },

  update(id: string, data: UpdateUserPayload) {
    return apiClient.put<Profile>(`/users/${id}`, data);
  },

  updateStatus(id: string, status: UserStatus) {
    return apiClient.patch<Profile>(`/users/${id}/status`, { status });
  },
};
