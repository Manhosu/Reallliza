import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/schedules/by-date?date=YYYY-MM-DD
 * Get all schedules for a specific date.
 * Accessible by all authenticated users.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date");

    if (!date) {
      return jsonResponse(
        { message: "date query parameter is required (format: YYYY-MM-DD)" },
        400
      );
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("schedules")
      .select(
        `
        *,
        technician:profiles!schedules_technician_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, priority, client_name, address_city)
      `
      )
      .eq("date", date)
      .order("start_time", { ascending: true });

    if (error) {
      console.error(
        `Failed to fetch schedules for date ${date}: ${error.message}`
      );
      throw new Error("Failed to fetch schedules for date");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
