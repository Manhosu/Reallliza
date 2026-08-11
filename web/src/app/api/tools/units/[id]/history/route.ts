import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/units/[id]/history
 * Timeline permanente da unidade física (spec seções 23-27).
 *
 * Filtros: ?from= &to= &technician_id= &service_order_id= &event_type=
 *          &order=desc|asc
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    const supabase = getAdminClient();

    let query = supabase
      .from("tool_events")
      .select(
        `*,
         technician:profiles!tool_events_technician_id_fkey(id, full_name),
         almoxarife:profiles!tool_events_almoxarife_id_fkey(id, full_name),
         service_order:service_orders(id, order_number, title)`
      )
      .eq("unit_id", id);

    const from = sp.get("from");
    if (from) query = query.gte("created_at", from);

    const to = sp.get("to");
    if (to) query = query.lte("created_at", to);

    const technicianId = sp.get("technician_id");
    if (technicianId) query = query.eq("technician_id", technicianId);

    const serviceOrderId = sp.get("service_order_id");
    if (serviceOrderId) query = query.eq("service_order_id", serviceOrderId);

    const eventType = sp.get("event_type");
    if (eventType && eventType !== "all") query = query.eq("event_type", eventType);

    const ascending = sp.get("order") === "asc";

    const { data, error } = await query
      .order("created_at", { ascending })
      .limit(500);

    if (error) throw new Error(`Failed to fetch unit history: ${error.message}`);

    return jsonResponse(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}
