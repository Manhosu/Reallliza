import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/custody/active
 * List all active custody records (tools not yet returned).
 * Optionally filtered by user_id query param.
 * Accessible by all authenticated users.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("user_id");

    const supabase = getAdminClient();

    let query = supabase
      .from("tool_custody")
      .select(
        `
        *,
        tool:tool_inventory!tool_custody_tool_id_fkey(id, name, serial_number, category, image_url),
        user:profiles!tool_custody_user_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!tool_custody_service_order_id_fkey(id, order_number, title)
      `
      )
      .is("checked_in_at", null)
      .order("checked_out_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch active custodies: ${error.message}`);
      throw new Error("Failed to fetch active custodies");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
