import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/service-orders/[id]/timeline
 * Get the complete status history (timeline) for a service order,
 * ordered by created_at descending, with user names joined.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    // Verify order exists
    const { data: order, error: findError } = await supabase
      .from("service_orders")
      .select("id, technician_id, partner_id")
      .eq("id", id)
      .single();

    if (findError || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    // Role-based access: technicians can only see their own orders
    if (user.role === "technician" && order.technician_id !== user.id) {
      throw new AuthError(403, "You do not have permission to view this timeline");
    }

    // Partners can only see their own partner's orders
    if (user.role === "partner") {
      const { data: partnerData } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!partnerData || order.partner_id !== partnerData.id) {
        throw new AuthError(403, "You do not have permission to view this timeline");
      }
    }

    // Fetch timeline entries with user names
    const { data: timeline, error } = await supabase
      .from("os_status_history")
      .select(
        `
        *,
        changed_by_user:profiles!os_status_history_changed_by_fkey(id, full_name, avatar_url, role)
      `
      )
      .eq("service_order_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Failed to fetch timeline for order ${id}: ${error.message}`);
      throw new Error("Failed to fetch service order timeline");
    }

    return jsonResponse(timeline || []);
  } catch (error) {
    return errorResponse(error);
  }
}
