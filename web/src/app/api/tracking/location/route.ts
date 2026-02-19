import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * POST /api/tracking/location
 * Record technician location. Any authenticated technician.
 * Body: { service_order_id?, latitude, longitude, accuracy?, speed?, heading? }
 * Inserts into technician_locations.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();
    const { service_order_id, latitude, longitude, accuracy, speed, heading } =
      body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      throw new AuthError(400, "latitude and longitude (numbers) are required");
    }

    const supabase = getAdminClient();

    // Build insert data
    const insertData: Record<string, unknown> = {
      user_id: user.id,
      latitude,
      longitude,
    };

    if (service_order_id) {
      insertData.service_order_id = service_order_id;
    }
    if (typeof accuracy === "number") {
      insertData.accuracy = accuracy;
    }
    if (typeof speed === "number") {
      insertData.speed = speed;
    }
    if (typeof heading === "number") {
      insertData.heading = heading;
    }

    const { data: location, error } = await supabase
      .from("technician_locations")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to record location for user ${user.id}: ${error.message}`
      );
      throw new Error("Failed to record location");
    }

    return jsonResponse(location, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
