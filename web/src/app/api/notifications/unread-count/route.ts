import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const supabase = getAdminClient();

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error(
        `Failed to get unread count for user ${user.id}: ${error.message}`
      );
      throw new Error("Failed to get unread notification count");
    }

    return jsonResponse({ unread_count: count || 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
