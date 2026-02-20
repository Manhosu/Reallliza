import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/schedules/my
 * List schedules for the authenticated technician.
 * Supports date_from/date_to filters.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");
    const status = searchParams.get("status");

    const supabase = getAdminClient();

    let query = supabase
      .from("schedules")
      .select(
        `
        *,
        technician:profiles!schedules_technician_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, client_name, address_city)
      `
      )
      .eq("technician_id", user.id);

    if (status) {
      query = query.eq("status", status);
    }

    if (date_from) {
      query = query.gte("date", date_from);
    }

    if (date_to) {
      query = query.lte("date", date_to);
    }

    query = query
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch my schedules: ${error.message}`);
      throw new Error("Failed to fetch schedules");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
