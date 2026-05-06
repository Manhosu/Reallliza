import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/external/messages
 * Recebe mensagens do operador (Garantias) para o técnico (Enterprise/Mobile).
 * Idempotente por external_message_id.
 *
 * Aceita 2 formatos de payload:
 *  A) { service_order_id (UUID Enterprise), external_message_id, sender_role,
 *       sender_name, content, attachment_url?, attachment_type? }
 *  B) { external_id (protocolo Garantias), external_message_id, sender_role,
 *       sender_name, content, attachment_url?, attachment_type? }
 *     — quando o Garantias só tem o protocolo do ticket.
 */
export async function POST(request: NextRequest) {
  try {
    const apiKeyAuth = await authenticateApiKey(request);
    const body = await request.json();

    if (!body.external_message_id) {
      throw new ApiKeyError(400, "external_message_id is required");
    }
    if (!body.content) {
      throw new ApiKeyError(400, "content is required");
    }
    if (!body.sender_role) {
      throw new ApiKeyError(400, "sender_role is required");
    }
    if (!body.sender_name) {
      throw new ApiKeyError(400, "sender_name is required");
    }

    const supabase = getAdminClient();

    // Idempotência
    const { data: existing } = await supabase
      .from("os_messages")
      .select("id, service_order_id, content, created_at")
      .eq("external_message_id", body.external_message_id)
      .maybeSingle();

    if (existing) {
      return jsonResponse(
        {
          id: existing.id,
          service_order_id: existing.service_order_id,
          deduplicated: true,
        },
        200
      );
    }

    // Resolver service_order_id (UUID interno do Enterprise)
    let serviceOrderId: string | null = body.service_order_id || null;
    let order:
      | {
          id: string;
          order_number: number | null;
          technician_id: string | null;
        }
      | null = null;

    if (serviceOrderId) {
      const { data } = await supabase
        .from("service_orders")
        .select("id, order_number, technician_id")
        .eq("id", serviceOrderId)
        .maybeSingle();
      order = data;
    } else if (body.external_id) {
      const { data } = await supabase
        .from("service_orders")
        .select("id, order_number, technician_id")
        .eq("external_system", apiKeyAuth.system_identifier)
        .eq("external_id", body.external_id)
        .maybeSingle();
      order = data;
      if (order) serviceOrderId = order.id;
    }

    if (!order || !serviceOrderId) {
      throw new ApiKeyError(
        404,
        "Service order not found (provide service_order_id or external_id)"
      );
    }

    const { data: msg, error } = await supabase
      .from("os_messages")
      .insert({
        service_order_id: serviceOrderId,
        sender_user_id: null,
        sender_role: body.sender_role,
        sender_name: body.sender_name,
        content: body.content,
        attachment_url: body.attachment_url || null,
        attachment_type: body.attachment_type || null,
        external_message_id: body.external_message_id,
      })
      .select("id, created_at")
      .single();

    if (error || !msg) {
      // Race condition: outra requisição inseriu a mesma external_message_id
      if (error?.code === "23505") {
        const { data: dup } = await supabase
          .from("os_messages")
          .select("id, service_order_id")
          .eq("external_message_id", body.external_message_id)
          .single();
        return jsonResponse(
          {
            id: dup?.id,
            service_order_id: dup?.service_order_id,
            deduplicated: true,
          },
          200
        );
      }
      console.error(
        `Failed to ingest external message: ${error?.message || "unknown"}`
      );
      throw new Error("Failed to insert message");
    }

    logAudit({
      userId: SYSTEM_USER_ID,
      action: "os_message.ingested_external",
      entityType: "os_message",
      entityId: msg.id,
      newData: {
        service_order_id: serviceOrderId,
        external_message_id: body.external_message_id,
        sender_role: body.sender_role,
      },
    });

    // Notificação push para o técnico (fire-and-forget)
    if (order.technician_id) {
      supabase
        .from("notifications")
        .insert({
          user_id: order.technician_id,
          title: `Nova mensagem na OS #${order.order_number ?? ""}`.trim(),
          body: String(body.content).slice(0, 120),
          type: "system",
          metadata: {
            service_order_id: serviceOrderId,
            message_id: msg.id,
            type: "message",
          },
        })
        .then(({ error: notifErr }) => {
          if (notifErr) {
            console.error(`Notification insert failed: ${notifErr.message}`);
          }
        });
    }

    return jsonResponse(
      {
        id: msg.id,
        service_order_id: serviceOrderId,
        created_at: msg.created_at,
      },
      201
    );
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`External Messages API Error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
