import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const { email, password, full_name, role, phone } = body;

    if (!email || !password || !full_name || !role) {
      throw new AuthError(400, "Email, password, full_name, and role are required");
    }

    if (password.length < 6) {
      throw new AuthError(400, "Password must be at least 6 characters");
    }

    const validRoles = ["admin", "manager", "technician", "partner"];
    if (!validRoles.includes(role)) {
      throw new AuthError(
        400,
        `Role must be one of: ${validRoles.join(", ")}`
      );
    }

    const supabase = getAdminClient();

    // Check if user already exists
    const { data: existingUsers } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      throw new AuthError(409, "A user with this email already exists");
    }

    // Create user in Supabase Auth using admin API
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role,
        },
      });

    if (authError) {
      throw new AuthError(500, `Failed to create user: ${authError.message}`);
    }

    // Upsert profile to be safe (trigger may also create it)
    const profileData: Record<string, unknown> = {
      id: authData.user.id,
      email,
      full_name,
      role,
      status: "active",
    };
    if (phone) profileData.phone = phone;

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "id" });

    if (profileError) {
      console.error(
        `Failed to create profile for ${email}: ${profileError.message}`
      );
      // Don't throw - the user was created in auth, profile can be fixed later
    }

    logAudit({
      userId: user.id,
      action: "CREATE",
      entityType: "user",
      entityId: authData.user.id,
      newData: { email, full_name, role },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(
      {
        id: authData.user.id,
        email: authData.user.email,
        full_name,
        role,
      },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
