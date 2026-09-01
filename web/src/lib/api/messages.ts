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
  /** 'interno' (Reallliza↔executor) ou 'loja' (loja↔executor). */
  channel?: "interno" | "loja";
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
  // Sem `channel`: staff/admin vê os dois canais juntos (supervisão); loja
  // sempre recebe só o dela, mesmo se pedir 'interno' — decisão do backend.
  listByOrder: (serviceOrderId: string, channel?: "interno" | "loja") =>
    apiClient.get<OsMessage[]>(
      `/service-orders/${serviceOrderId}/messages`,
      channel ? { channel } : undefined
    ),

  send: (serviceOrderId: string, content: string, channel?: "interno" | "loja") =>
    apiClient.post<OsMessage>(`/service-orders/${serviceOrderId}/messages`, {
      content,
      channel,
    }),

  listActiveChats: (params?: { page?: number; limit?: number }) =>
    apiClient.get<{ data: OsWithLastMessage[]; meta: { total: number; page: number; total_pages: number } }>(
      `/messages/chats`,
      params as Record<string, unknown>,
    ),
};
