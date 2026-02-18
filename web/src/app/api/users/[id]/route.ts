import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !profile) {
      throw new AuthError(404, `User with ID ${id} not found`);
    }

    // If the user is a partner, fetch their partner data
    let partner = null;
    if (profile.role === "partner") {
      const { data: partnerData } = await supabase
        .from("partners")
        .select("*")
        .eq("user_id", id)
        .single();

      partner = partnerData;
    }

    return jsonResponse({
      ...profile,
      partner,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();
    const supabase = getAdminClient();

    // Verify user exists and get old data for audit
    const { data: existing, error: findError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `User with ID ${id} not found`);
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update user ${id}: ${error.message}`);
      throw new Error("Failed to update user");
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "user.updated",
      entityType: "user",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      newData: profile as Record<string, unknown>,
    });

    return jsonResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
