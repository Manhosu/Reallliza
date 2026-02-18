import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceOrderId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "technician", "partner"]);

    const { serviceOrderId } = await params;
    const supabase = getAdminClient();

    // Check for optional type filter from query params
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    let query = supabase
      .from("photos")
      .select("*")
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: true });

    if (type) {
      const validTypes = ["before", "during", "after", "issue", "signature"];
      if (validTypes.includes(type)) {
        query = query.eq("type", type);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        `Failed to fetch photos for service order ${serviceOrderId}: ${error.message}`
      );
      throw new Error("Failed to fetch photos");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
