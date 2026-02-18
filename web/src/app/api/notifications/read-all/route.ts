import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const supabase = getAdminClient();

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error(
        `Failed to mark all notifications as read for user ${user.id}: ${error.message}`
      );
      throw new Error("Failed to mark all notifications as read");
    }

    return jsonResponse({ message: "All notifications marked as read" });
  } catch (error) {
    return errorResponse(error);
  }
}
