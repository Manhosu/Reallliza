import { dispatchWebhook } from "./webhook-dispatcher";

interface MessageDispatchInput {
  service_order_id: string;
  message_id: string;
  sender_role: string;
  sender_name: string;
  content: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  created_at: string;
}

/**
 * Dispara o webhook `service_order.message_received` pro sistema externo
 * (Garantias) quando uma mensagem é inserida do lado da Execução.
 *
 * O callback do Garantias (`/api/webhook/enterprise-callback`) já trata esse
 * evento — insere em `ticket_messages` com `remetente_tipo=TECNICO` e dedupa
 * por `whatsapp_message_id = enterprise:<message.id>`.
 *
 * Fire-and-forget — usa o `webhook_events` interno com HMAC + retry cron.
 */
export async function dispatchTechMessageToGarantias(
  input: MessageDispatchInput
): Promise<void> {
  await dispatchWebhook(input.service_order_id, "service_order.message_received", {
    message: {
      id: input.message_id,
      sender_role: input.sender_role,
      sender_name: input.sender_name,
      content: input.content,
      attachment_url: input.attachment_url ?? null,
      attachment_type: input.attachment_type ?? null,
      created_at: input.created_at,
    },
  });
}
