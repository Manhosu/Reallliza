import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);

    const { id } = await params;
    const supabase = getAdminClient();

    // Verify the notification exists and belongs to this user
    const { data: notification, error: findError } = await supabase
      .from("notifications")
      .select("id, user_id, read_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (findError || !notification) {
      throw new AuthError(404, `Notification with ID ${id} not found`);
    }

    // Already read - return as-is
    if (notification.read_at) {
      return jsonResponse(notification);
    }

    const { data: updated, error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to mark notification ${id} as read: ${error.message}`
      );
      throw new Error("Failed to mark notification as read");
    }

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
