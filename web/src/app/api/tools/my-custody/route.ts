import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/my-custody
 * List active custody records for the authenticated user.
 * Returns tools currently checked out to the user (not yet returned).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("tool_custody")
      .select(
        `
        *,
        tool:tool_inventory(id, name, serial_number, category, photo_url),
        service_order:service_orders(id, order_number, title)
      `
      )
      .eq("user_id", user.id)
      .is("checked_in_at", null)
      .order("checked_out_at", { ascending: false });

    if (error) {
      console.error(`Failed to fetch my custody: ${error.message}`);
      throw new Error("Failed to fetch custody records");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
