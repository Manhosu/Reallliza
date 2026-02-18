import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/partners/[id]/stats
 * Get statistics for a specific partner (OS counts by status).
 * Accessible by: any authenticated user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    // Verify the partner exists
    const { data: partner, error: findError } = await supabase
      .from("partners")
      .select("id")
      .eq("id", id)
      .single();

    if (findError || !partner) {
      return jsonResponse(
        { message: `Partner with ID ${id} not found` },
        404
      );
    }

    // Get all service orders for this partner to compute stats
    const { data: orders, error } = await supabase
      .from("service_orders")
      .select("status")
      .eq("partner_id", id);

    if (error) {
      console.error(
        `Failed to fetch stats for partner ${id}: ${error.message}`
      );
      return jsonResponse(
        { message: "Failed to fetch partner stats" },
        500
      );
    }

    // Build counts by status
    const statusCounts: Record<string, number> = {
      draft: 0,
      pending: 0,
      assigned: 0,
      in_progress: 0,
      paused: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
    };

    let total = 0;
    if (orders) {
      for (const order of orders) {
        const orderStatus = order.status as string;
        if (orderStatus in statusCounts) {
          statusCounts[orderStatus]++;
        }
        total++;
      }
    }

    return jsonResponse({
      partner_id: id,
      total_service_orders: total,
      by_status: statusCounts,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
