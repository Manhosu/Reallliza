import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/[id]/history
 * Get the full custody history for a specific tool.
 * Accessible by all authenticated users.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id: toolId } = await params;

    const supabase = getAdminClient();

    // Verify tool exists
    const { data: tool, error: findError } = await supabase
      .from("tool_inventory")
      .select("id")
      .eq("id", toolId)
      .single();

    if (findError || !tool) {
      return jsonResponse(
        { message: `Tool with ID ${toolId} not found` },
        404
      );
    }

    const { data: history, error } = await supabase
      .from("tool_custody")
      .select(
        `
        *,
        user:profiles!tool_custody_user_id_fkey(id, full_name, email, avatar_url),
        service_order:service_orders!tool_custody_service_order_id_fkey(id, order_number, title)
      `
      )
      .eq("tool_id", toolId)
      .order("checked_out_at", { ascending: false });

    if (error) {
      console.error(
        `Failed to fetch custody history for tool ${toolId}: ${error.message}`
      );
      throw new Error("Failed to fetch custody history");
    }

    return jsonResponse(history || []);
  } catch (error) {
    return errorResponse(error);
  }
}
