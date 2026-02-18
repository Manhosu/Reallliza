import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/schedules/technician/[technicianId]
 * Get all schedules for a technician within a date range.
 * Query params: date_from, date_to (both required).
 * Accessible by all authenticated users.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ technicianId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { technicianId } = await params;

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    if (!dateFrom || !dateTo) {
      return jsonResponse(
        { message: "date_from and date_to query parameters are required" },
        400
      );
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("schedules")
      .select(
        `
        *,
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, priority, client_name, address_city)
      `
      )
      .eq("technician_id", technicianId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.error(
        `Failed to fetch schedules for technician ${technicianId}: ${error.message}`
      );
      throw new Error("Failed to fetch technician schedules");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
