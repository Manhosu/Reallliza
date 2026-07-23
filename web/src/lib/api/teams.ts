import { apiClient } from "./client";

export interface TeamMember {
  technician_id: string;
  is_leader: boolean;
  joined_at?: string;
  profile: {
    id: string;
    full_name: string;
    email: string;
    phone?: string | null;
    avatar_url?: string | null;
  } | null;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  members?: TeamMember[];
  member_count?: number;
  specialties?: Array<{ id: string; name: string }>;
}

export interface TeamCalendarEvent {
  id: string;
  kind: "schedule" | "os";
  title: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  service_order_id: string | null;
  service_order: {
    id: string;
    order_number: string;
    title: string;
    client_name: string;
    status: string;
    priority: string | null;
  } | null;
  technician_id: string | null;
}

export interface TeamCalendarResponse {
  team: Pick<Team, "id" | "name" | "color" | "is_active">;
  from: string;
  to: string;
  member_count: number;
  events: TeamCalendarEvent[];
}

export const teamsApi = {
  list(includeInactive = false) {
    return apiClient.get<Team[]>(
      `/teams${includeInactive ? "?include_inactive=1" : ""}`
    );
  },
  get(id: string) {
    return apiClient.get<Team>(`/teams/${id}`);
  },
  create(data: { name: string; color?: string; description?: string }) {
    return apiClient.post<Team>("/teams", data);
  },
  update(
    id: string,
    data: Partial<Pick<Team, "name" | "color" | "description" | "is_active">>
  ) {
    return apiClient.patch<Team>(`/teams/${id}`, data);
  },
  deactivate(id: string) {
    return apiClient.delete<{ id: string; name: string }>(`/teams/${id}`);
  },
  addMember(
    teamId: string,
    data: { technician_id: string; is_leader?: boolean }
  ) {
    return apiClient.post(`/teams/${teamId}/members`, data);
  },
  removeMember(teamId: string, technicianId: string) {
    return apiClient.delete(
      `/teams/${teamId}/members?technician_id=${technicianId}`
    );
  },
  calendar(teamId: string, params?: { from?: string; days?: number }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.days) qs.set("days", String(params.days));
    const qsStr = qs.toString();
    return apiClient.get<TeamCalendarResponse>(
      `/teams/${teamId}/calendar${qsStr ? "?" + qsStr : ""}`
    );
  },
};
