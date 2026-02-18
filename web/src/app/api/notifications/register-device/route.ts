import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();
    const { token, platform } = body;

    if (!token || !platform) {
      throw new AuthError(400, "Token and platform are required");
    }

    const validPlatforms = ["ios", "android", "web"];
    if (!validPlatforms.includes(platform)) {
      throw new AuthError(
        400,
        `Invalid platform. Must be one of: ${validPlatforms.join(", ")}`
      );
    }

    const supabase = getAdminClient();

    // Upsert: if token already exists for this user, update it
    const { data: existing } = await supabase
      .from("device_tokens")
      .select("id")
      .eq("user_id", user.id)
      .eq("token", token)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await supabase
        .from("device_tokens")
        .update({
          platform,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        console.error(
          `Failed to update device token for user ${user.id}: ${error.message}`
        );
        throw new Error("Failed to register device token");
      }

      return jsonResponse(updated);
    }

    const { data: device, error } = await supabase
      .from("device_tokens")
      .insert({
        user_id: user.id,
        token,
        platform,
      })
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to register device token for user ${user.id}: ${error.message}`
      );
      throw new Error("Failed to register device token");
    }

    return jsonResponse(device, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
