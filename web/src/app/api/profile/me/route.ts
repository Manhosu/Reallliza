import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/profile/me
 * Get the authenticated user's profile.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const supabase = getAdminClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      throw new AuthError(500, "Failed to fetch profile");
    }

    return jsonResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/profile/me
 * Update the authenticated user's profile.
 * Allowed fields: full_name, phone, avatar_url, cpf, rg, address, specialties.
 */
const ALLOWED_FIELDS = [
  "full_name",
  "phone",
  "avatar_url",
  "cpf",
  "rg",
  "address",
  "specialties",
];

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new AuthError(400, "No valid fields to update");
    }

    updateData.updated_at = new Date().toISOString();

    const supabase = getAdminClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      throw new AuthError(500, "Failed to update profile");
    }

    logAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "profile",
      entityId: user.id,
      newData: updateData,
    });

    return jsonResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
