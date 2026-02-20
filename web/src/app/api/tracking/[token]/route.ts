import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tracking/[token]
 * Public tracking page data (NO authentication required).
 * Looks up service_order by tracking_token.
 * Returns limited data: technician_name, technician_avatar, status,
 *   client_name (first name only), latest_location, estimated_arrival.
 * If OS is not in_transit or in_progress, returns { status: 'not_tracking' }.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const supabase = getAdminClient();

    // Look up the service order by tracking_token
    const { data: order, error: orderError } = await supabase
      .from("service_orders")
      .select(
        `
        id,
        status,
        client_name,
        technician_id,
        estimated_arrival
      `
      )
      .eq("tracking_token", token)
      .single();

    if (orderError || !order) {
      return jsonResponse({ status: "not_tracking" });
    }

    // Only show tracking data if the OS is in active transit/progress
    if (!["in_transit", "in_progress"].includes(order.status)) {
      return jsonResponse({ status: "not_tracking" });
    }

    // Get technician profile
    let technicianName: string | null = null;
    let technicianAvatar: string | null = null;

    if (order.technician_id) {
      const { data: techProfile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", order.technician_id)
        .single();

      if (techProfile) {
        technicianName = techProfile.full_name || null;
        technicianAvatar = techProfile.avatar_url || null;
      }
    }

    // Get latest location for the technician
    let latestLocation: { lat: number; lng: number } | null = null;

    if (order.technician_id) {
      const { data: location } = await supabase
        .from("technician_locations")
        .select("latitude, longitude")
        .eq("user_id", order.technician_id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (location) {
        latestLocation = {
          lat: location.latitude,
          lng: location.longitude,
        };
      }
    }

    // Extract first name only from client_name for privacy
    const clientFirstName = order.client_name
      ? order.client_name.split(" ")[0]
      : null;

    return jsonResponse({
      technician_name: technicianName,
      technician_avatar: technicianAvatar,
      status: order.status,
      client_name: clientFirstName,
      latest_location: latestLocation,
      estimated_arrival: order.estimated_arrival || null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
