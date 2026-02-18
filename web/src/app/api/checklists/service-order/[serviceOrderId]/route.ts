import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/checklists/service-order/[serviceOrderId]
 * Get all checklists for a specific service order.
 * Authenticated users.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceOrderId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { serviceOrderId } = await params;

    const supabase = getAdminClient();

    // Verify the service order exists
    const { data: serviceOrder, error: soError } = await supabase
      .from("service_orders")
      .select("id")
      .eq("id", serviceOrderId)
      .single();

    if (soError || !serviceOrder) {
      throw new AuthError(
        404,
        `Service order with ID ${serviceOrderId} not found`
      );
    }

    const { data: checklists, error } = await supabase
      .from("checklists")
      .select(
        `
        *,
        template:checklist_templates!checklists_template_id_fkey(id, name),
        completed_by_user:profiles!checklists_completed_by_fkey(id, full_name)
      `
      )
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        `Failed to fetch checklists for service order ${serviceOrderId}: ${error.message}`
      );
      throw new Error("Failed to fetch checklists for service order");
    }

    return jsonResponse(checklists || []);
  } catch (error) {
    return errorResponse(error);
  }
}
