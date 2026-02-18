import { NextRequest } from "next/server";
import { getAdminClient } from "./supabase-admin";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  full_name: string;
  access_token: string;
}

export async function authenticateRequest(
  request: NextRequest
): Promise<AuthUser> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    throw new AuthError(401, "Authorization header is missing");
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AuthError(
      401,
      "Invalid authorization format. Use: Bearer <token>"
    );
  }

  const supabase = getAdminClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new AuthError(401, "Invalid or expired token");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, status, full_name")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.warn(
      `Failed to fetch profile for user ${user.id}: ${profileError.message}`
    );
  }

  if (profile?.status === "inactive" || profile?.status === "suspended") {
    throw new AuthError(
      403,
      "Your account has been deactivated. Please contact an administrator."
    );
  }

  return {
    id: user.id,
    email: user.email!,
    role: profile?.role || user.user_metadata?.role || "technician",
    full_name: profile?.full_name || user.user_metadata?.full_name || "",
    access_token: token,
  };
}

export function checkRole(user: AuthUser, roles: string[]): void {
  if (!roles.includes(user.role)) {
    throw new AuthError(403, "You do not have permission to perform this action");
  }
}

export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
