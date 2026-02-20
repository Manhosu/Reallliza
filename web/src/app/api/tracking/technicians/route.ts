import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tracking/technicians
 * Get latest location of all technicians currently in active OS
 * (status in_transit or in_progress). Admin only.
 * Returns array of { user_id, full_name, avatar_url, latitude, longitude,
 *   recorded_at, service_order: { id, title, status, client_name } }.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const supabase = getAdminClient();

    // Get all service orders that are currently active (in_transit or in_progress)
    // with their assigned technician
    const { data: activeOrders, error: ordersError } = await supabase
      .from("service_orders")
      .select(
        `
        id,
        title,
        status,
        client_name,
        technician_id
      `
      )
      .in("status", ["in_transit", "in_progress"])
      .not("technician_id", "is", null);

    if (ordersError) {
      console.error(
        `Failed to fetch active service orders: ${ordersError.message}`
      );
      throw new Error("Failed to fetch active service orders");
    }

    if (!activeOrders || activeOrders.length === 0) {
      return jsonResponse([]);
    }

    // Get unique technician IDs
    const technicianIds = [
      ...new Set(activeOrders.map((o) => o.technician_id as string)),
    ];

    // Get profiles for all active technicians
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", technicianIds);

    if (profilesError) {
      console.error(
        `Failed to fetch technician profiles: ${profilesError.message}`
      );
      throw new Error("Failed to fetch technician profiles");
    }

    // For each technician, get their most recent location
    const results = [];

    for (const techId of technicianIds) {
      const { data: latestLocation } = await supabase
        .from("technician_locations")
        .select("latitude, longitude, recorded_at")
        .eq("user_id", techId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const profile = profiles?.find((p) => p.id === techId);
      const techOrders = activeOrders.filter(
        (o) => o.technician_id === techId
      );

      // Use the first active order for this technician
      const activeOrder = techOrders[0];

      results.push({
        user_id: techId,
        full_name: profile?.full_name || null,
        avatar_url: profile?.avatar_url || null,
        latitude: latestLocation?.latitude || null,
        longitude: latestLocation?.longitude || null,
        recorded_at: latestLocation?.recorded_at || null,
        service_order: {
          id: activeOrder.id,
          title: activeOrder.title,
          status: activeOrder.status,
          client_name: activeOrder.client_name,
        },
      });
    }

    return jsonResponse(results);
  } catch (error) {
    return errorResponse(error);
  }
}
