import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { dispatchTechMessageToGarantias } from "@/lib/api-helpers/dispatch-message";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * Mapeia o role do usuário logado pro `sender_role` da mensagem.
 * Mantém os mesmos rótulos que o Garantias usa em `ticket_messages.remetente_tipo`.
 */
function senderRoleFromUserRole(role: string): "TECNICO" | "OPERADOR" | "PARTNER" {
  if (role === "technician") return "TECNICO";
  if (role === "partner") return "PARTNER";
  return "OPERADOR"; // admin | manager
}

/**
 * Resolve a OS + checa permissão.
 * Reusa o padrão de `/api/service-orders/[id]/route.ts` (linhas 39-55).
 */
async function loadAuthorizedOrder(
  request: NextRequest,
  orderId: string
) {
  const user = await authenticateRequest(request);
  const supabase = getAdminClient();

  const { data: order, error } = await supabase
    .from("service_orders")
    .select(
      "id, order_number, technician_id, partner_id, created_by, status, title, external_callback_url"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw new AuthError(404, "Service order not found");
  }

  if (user.role === "technician" && order.technician_id !== user.id) {
    throw new AuthError(403, "You do not have permission to view this service order");
  }

  if (user.role === "partner") {
    const { data: partnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!partnerData || order.partner_id !== partnerData.id) {
      throw new AuthError(403, "You do not have permission to view this service order");
    }
  }

  return { user, supabase, order };
}

/**
 * GET /api/service-orders/[id]/messages
 *
 * Lista as mensagens da OS, mais antigas primeiro.
 * Ao mesmo tempo marca como lidas as mensagens que o usuário ainda não viu
 * (todas exceto as próprias). Idempotente — só atualiza onde `read_at IS NULL`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase, order } = await loadAuthorizedOrder(request, id);

    const { data, error } = await supabase
      .from("os_messages")
      .select(
        "id, service_order_id, sender_user_id, sender_role, sender_name, content, attachment_url, attachment_type, external_message_id, read_at, created_at"
      )
      .eq("service_order_id", order.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(`Failed to load os_messages: ${error.message}`);
      throw new Error("Failed to load messages");
    }

    // Marca como lidas as mensagens dos outros (fire-and-forget).
    supabase
      .from("os_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("service_order_id", order.id)
      .is("read_at", null)
      .neq("sender_user_id", user.id)
      .then(({ error: markErr }) => {
        if (markErr) {
          console.warn(`Mark-as-read failed: ${markErr.message}`);
        }
      });

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/service-orders/[id]/messages
 *
 * Body: { content: string, attachment_url?: string, attachment_type?: string }
 *
 * Insere a mensagem em `os_messages`, dispara webhook reverso pra Garantias
 * (sempre — o callback dedupa do outro lado) e gera notificação pro
 * "outro lado" da conversa na Execução.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase, order } = await loadAuthorizedOrder(request, id);

    const body = (await request.json()) as {
      content?: string;
      attachment_url?: string;
      attachment_type?: string;
    };

    const content = (body.content || "").trim();
    if (!content) {
      throw new AuthError(400, "content is required");
    }

    const senderRole = senderRoleFromUserRole(user.role);

    const { data: msg, error: insertErr } = await supabase
      .from("os_messages")
      .insert({
        service_order_id: order.id,
        sender_user_id: user.id,
        sender_role: senderRole,
        sender_name: user.full_name || user.email || "Usuário",
        content,
        attachment_url: body.attachment_url || null,
        attachment_type: body.attachment_type || null,
        external_message_id: null,
      })
      .select(
        "id, service_order_id, sender_user_id, sender_role, sender_name, content, attachment_url, attachment_type, external_message_id, read_at, created_at"
      )
      .single();

    if (insertErr || !msg) {
      console.error(`Failed to insert os_messages: ${insertErr?.message}`);
      throw new Error("Failed to insert message");
    }

    logAudit({
      userId: user.id,
      action: "os_message.sent",
      entityType: "os_message",
      entityId: msg.id,
      newData: {
        service_order_id: order.id,
        sender_role: senderRole,
      },
    });

    // Webhook reverso Execução → Garantias (fire-and-forget).
    if (order.external_callback_url) {
      dispatchTechMessageToGarantias({
        service_order_id: order.id,
        message_id: msg.id,
        sender_role: senderRole,
        sender_name: msg.sender_name,
        content: msg.content,
        attachment_url: msg.attachment_url,
        attachment_type: msg.attachment_type,
        created_at: msg.created_at,
      }).catch((err) => {
        console.error("dispatchTechMessageToGarantias failed:", err);
      });
    }

    // Notifica o "outro lado" da conversa na Execução (com push + priority).
    const recipientId =
      user.id === order.technician_id
        ? order.created_by // técnico mandou → operador/admin que criou recebe
        : order.technician_id; // operador/parceiro mandou → técnico recebe

    if (recipientId && recipientId !== user.id) {
      createNotification(
        recipientId,
        `Nova mensagem na OS #${order.order_number ?? ""}`.trim(),
        content.slice(0, 120),
        "message_received",
        {
          service_order_id: order.id,
          message_id: msg.id,
          sender_role: senderRole,
        },
        { priority: "high" }
      ).catch((err) => {
        console.warn("Notification dispatch failed:", err);
      });
    }

    return jsonResponse(msg, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
