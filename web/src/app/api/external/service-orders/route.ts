import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { dispatchWebhook } from "@/lib/api-helpers/webhook-dispatcher";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/external/service-orders
 * Cria uma OS a partir de sistema externo (ex: Garantias).
 * Autenticação via X-API-Key header.
 */
export async function POST(request: NextRequest) {
  try {
    const apiKeyAuth = await authenticateApiKey(request);
    const body = await request.json();

    // Validações obrigatórias
    if (!body.external_system) {
      throw new ApiKeyError(400, "external_system is required");
    }
    if (!body.external_id) {
      throw new ApiKeyError(400, "external_id is required");
    }
    if (!body.title) {
      throw new ApiKeyError(400, "title is required");
    }
    if (!body.client_name) {
      throw new ApiKeyError(400, "client_name is required");
    }

    // Validar que external_system bate com a API key
    if (body.external_system !== apiKeyAuth.system_identifier) {
      throw new ApiKeyError(
        403,
        `API key is not authorized for system '${body.external_system}'. Expected '${apiKeyAuth.system_identifier}'.`
      );
    }

    const supabase = getAdminClient();

    // Verificar duplicata (idempotência)
    const { data: existing } = await supabase
      .from("service_orders")
      .select("id, order_number, status, created_at")
      .eq("external_system", body.external_system)
      .eq("external_id", body.external_id)
      .maybeSingle();

    if (existing) {
      return jsonResponse(
        {
          message: `Service order already exists for ${body.external_system}/${body.external_id}`,
          id: existing.id,
          order_number: existing.order_number,
          status: existing.status,
          created_at: existing.created_at,
        },
        409
      );
    }

    // Montar dados da OS
    const insertData: Record<string, unknown> = {
      title: body.title,
      client_name: body.client_name,
      status: "pending",
      created_by: SYSTEM_USER_ID,
      external_system: body.external_system,
      external_id: body.external_id,
      external_callback_url: body.external_callback_url || null,
      external_metadata: body.external_metadata || {},
    };

    // Campos opcionais
    const optionalFields = [
      "description",
      "priority",
      "client_phone",
      "client_email",
      "client_document",
      "address_street",
      "address_number",
      "address_complement",
      "address_neighborhood",
      "address_city",
      "address_state",
      "address_zip",
      "notes",
    ];

    for (const field of optionalFields) {
      if (body[field] !== undefined && body[field] !== null) {
        insertData[field] = body[field];
      }
    }

    if (body.geo_lat !== undefined) insertData.geo_lat = body.geo_lat;
    if (body.geo_lng !== undefined) insertData.geo_lng = body.geo_lng;
    if (body.estimated_value !== undefined)
      insertData.estimated_value = body.estimated_value;

    const { data: order, error } = await supabase
      .from("service_orders")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      // Unique constraint violation (race condition)
      if (error.code === "23505") {
        throw new ApiKeyError(
          409,
          `Service order already exists for ${body.external_system}/${body.external_id}`
        );
      }
      console.error(`Failed to create external service order: ${error.message}`);
      throw new Error("Failed to create service order");
    }

    // Status history
    await supabase.from("os_status_history").insert({
      service_order_id: order.id,
      from_status: null,
      to_status: "pending",
      changed_by: SYSTEM_USER_ID,
      notes: `Criada via integração externa (${body.external_system})`,
    });

    // Audit log
    logAudit({
      userId: SYSTEM_USER_ID,
      action: "service_order.created_external",
      entityType: "service_order",
      entityId: order.id,
      newData: {
        external_system: body.external_system,
        external_id: body.external_id,
        title: body.title,
        client_name: body.client_name,
      },
    });

    const trackingUrl = `${
      process.env.NEXT_PUBLIC_APP_URL || "https://reallliza-web.vercel.app"
    }/service-orders/${order.id}`;

    // Disparar webhook de criação (fire-and-forget)
    if (body.external_callback_url) {
      dispatchWebhook(order.id, "service_order.created", {
        data: {
          order_number: order.order_number,
          status: order.status,
          tracking_url: trackingUrl,
        },
      }).catch((err) =>
        console.error("Webhook dispatch failed:", err)
      );
    }

    return jsonResponse(
      {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        tracking_url: trackingUrl,
        created_at: order.created_at,
      },
      201
    );
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`External API Error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
