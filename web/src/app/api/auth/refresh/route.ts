import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { AuthError } from "@/lib/api-helpers/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refresh_token } = body;

    if (!refresh_token) {
      throw new AuthError(400, "Refresh token is required");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      throw new AuthError(400, "Invalid or expired refresh token.");
    }

    if (!data.session) {
      throw new AuthError(400, "Failed to refresh session.");
    }

    return jsonResponse({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
