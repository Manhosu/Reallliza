import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();
    const { new_password } = body;

    if (!new_password) {
      throw new AuthError(400, "New password is required");
    }

    if (new_password.length < 6) {
      throw new AuthError(400, "Password must be at least 6 characters");
    }

    const supabase = getAdminClient();

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: new_password,
    });

    if (error) {
      throw new AuthError(
        400,
        "Failed to update password. Please try again."
      );
    }

    logAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "password",
      entityId: user.id,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse({
      message: "Password updated successfully.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
