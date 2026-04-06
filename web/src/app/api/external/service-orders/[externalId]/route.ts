import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/external/service-orders/[externalId]?system=GARANTIAS
 * Consulta o status de uma OS pelo external_id.
 * Autenticação via X-API-Key header.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ externalId: string }> }
) {
  try {
    const apiKeyAuth = await authenticateApiKey(request);
    const { externalId } = await params;

    const searchParams = request.nextUrl.searchParams;
    const system =
      searchParams.get("system") || apiKeyAuth.system_identifier;

    const supabase = getAdminClient();

    const { data: order, error } = await supabase
      .from("service_orders")
      .select(
        `
        id,
        order_number,
        title,
        description,
        status,
        priority,
        client_name,
        client_phone,
        technician_id,
        partner_id,
        started_at,
        completed_at,
        estimated_value,
        final_value,
        external_system,
        external_id,
        external_metadata,
        notes,
        created_at,
        updated_at,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, phone)
      `
      )
      .eq("external_system", system)
      .eq("external_id", externalId)
      .maybeSingle();

    if (error) {
      console.error(
        `Failed to query external service order: ${error.message}`
      );
      throw new Error("Failed to query service order");
    }

    if (!order) {
      throw new ApiKeyError(
        404,
        `Service order not found for ${system}/${externalId}`
      );
    }

    // Buscar fotos (resumo)
    const { count: photoCount } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("service_order_id", order.id);

    // Buscar histórico de status
    const { data: statusHistory } = await supabase
      .from("os_status_history")
      .select("from_status, to_status, notes, created_at")
      .eq("service_order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const trackingUrl = `${
      process.env.NEXT_PUBLIC_APP_URL || "https://reallliza-web.vercel.app"
    }/service-orders/${order.id}`;

    return jsonResponse({
      ...order,
      tracking_url: trackingUrl,
      photos_count: photoCount || 0,
      status_history: statusHistory || [],
    });
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
