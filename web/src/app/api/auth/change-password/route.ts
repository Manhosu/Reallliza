import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/auth/change-password
 * Change password for the authenticated user.
 * Body: { current_password, new_password }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();
    const { current_password, new_password } = body;

    if (!current_password || !new_password) {
      throw new AuthError(400, "current_password and new_password are required");
    }

    if (new_password.length < 6) {
      throw new AuthError(400, "New password must be at least 6 characters");
    }

    // Verify current password by attempting to sign in
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const tempClient = createClient(supabaseUrl, supabaseAnonKey);

    const { error: signInError } = await tempClient.auth.signInWithPassword({
      email: user.email,
      password: current_password,
    });

    if (signInError) {
      throw new AuthError(401, "Current password is incorrect");
    }

    // Use the user's access token to update password
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${user.access_token}`,
        },
      },
    });

    const { error: updateError } = await userClient.auth.updateUser({
      password: new_password,
    });

    if (updateError) {
      console.error(`Failed to change password: ${updateError.message}`);
      throw new AuthError(500, "Failed to change password");
    }

    logAudit({
      userId: user.id,
      action: "auth.password_changed",
      entityType: "user",
      entityId: user.id,
    });

    return jsonResponse({ message: "Password changed successfully" });
  } catch (error) {
    return errorResponse(error);
  }
}
