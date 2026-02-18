import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();
    const { token } = body;

    if (!token) {
      throw new AuthError(400, "Token is required");
    }

    const supabase = getAdminClient();

    const { error } = await supabase
      .from("device_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("token", token);

    if (error) {
      console.error(
        `Failed to remove device token for user ${user.id}: ${error.message}`
      );
      throw new Error("Failed to remove device token");
    }

    return jsonResponse({ message: "Device token removed successfully" });
  } catch (error) {
    return errorResponse(error);
  }
}
