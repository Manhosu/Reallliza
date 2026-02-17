import { apiClient } from "./client";
import type {
  Schedule,
  ScheduleStatus,
  PaginatedResponse,
} from "@/lib/types";

// ============================================================
// Request / Query types
// ============================================================

export interface ListSchedulesParams {
  page?: number;
  limit?: number;
  technician_id?: string;
  date_from?: string;
  date_to?: string;
  status?: ScheduleStatus;
}

export type CreateSchedulePayload = Omit<
  Schedule,
  | "id"
  | "status"
  | "actual_start_time"
  | "actual_end_time"
  | "created_by"
  | "created_at"
  | "updated_at"
>;

export type UpdateSchedulePayload = Partial<CreateSchedulePayload> & {
  status?: ScheduleStatus;
};

// ============================================================
// API calls
// ============================================================

export const schedulesApi = {
  list(params?: ListSchedulesParams) {
    return apiClient.get<PaginatedResponse<Schedule>>(
      "/schedules",
      params as Record<string, unknown>
    );
  },

  getById(id: string) {
    return apiClient.get<Schedule>(`/schedules/${id}`);
  },

  create(data: CreateSchedulePayload) {
    return apiClient.post<Schedule>("/schedules", data);
  },

  update(id: string, data: UpdateSchedulePayload) {
    return apiClient.put<Schedule>(`/schedules/${id}`, data);
  },

  getByTechnician(
    technicianId: string,
    weekStart: string,
    weekEnd: string
  ) {
    return apiClient.get<Schedule[]>(
      `/schedules/technician/${technicianId}`,
      { date_from: weekStart, date_to: weekEnd }
    );
  },

  getByDate(date: string) {
    return apiClient.get<Schedule[]>("/schedules/by-date", { date });
  },
};
