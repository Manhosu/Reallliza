import { apiClient } from "./client";

export interface OsMessage {
  id: string;
  service_order_id: string;
  sender_user_id: string | null;
  sender_role: string;
  sender_name: string;
  content: string;
  attachment_url: string | null;
  attachment_type: string | null;
  external_message_id: string | null;
  created_at: string;
}

export interface OsWithLastMessage {
  id: string;
  order_number: number;
  title: string;
  status: string;
  technician_id: string | null;
  technician_name?: string;
  last_message?: OsMessage;
  unread_count?: number;
}

export const messagesApi = {
  listByOrder: (serviceOrderId: string) =>
    apiClient.get<OsMessage[]>(`/service-orders/${serviceOrderId}/messages`),

  send: (serviceOrderId: string, content: string) =>
    apiClient.post<OsMessage>(`/service-orders/${serviceOrderId}/messages`, { content }),

  listActiveChats: (params?: { page?: number; limit?: number }) =>
    apiClient.get<{ data: OsWithLastMessage[]; meta: { total: number; page: number; total_pages: number } }>(
      `/messages/chats`,
      params as Record<string, unknown>,
    ),
};
