import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const ALLOWED_FIELDS = [
  "full_name",
  "phone",
  "avatar_url",
  "cpf",
  "rg",
  "address",
  "specialties",
];

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const body = await request.json();

    // Filter to only allowed fields
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

    // Fetch old data for audit log
    const { data: oldProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

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
      oldData: oldProfile,
      newData: updateData,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
