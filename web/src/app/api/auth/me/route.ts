import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const supabase = getAdminClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      throw new AuthError(404, "Profile not found");
    }

    return jsonResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
