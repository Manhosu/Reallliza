import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/partners/[id]
 * Get a partner by ID.
 * Accessible by: any authenticated user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: partner, error } = await supabase
      .from("partners")
      .select(
        `
        *,
        user:profiles!partners_user_id_fkey(id, full_name, email, phone, avatar_url, role, status)
      `
      )
      .eq("id", id)
      .single();

    if (error || !partner) {
      return jsonResponse(
        { message: `Partner with ID ${id} not found` },
        404
      );
    }

    return jsonResponse(partner);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/partners/[id]
 * Update a partner.
 * Accessible by: admin only
 */
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

    // Verify the partner exists and capture old data for audit
    const { data: existing, error: findError } = await supabase
      .from("partners")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return jsonResponse(
        { message: `Partner with ID ${id} not found` },
        404
      );
    }

    // If updating user_id, verify the user exists and has role 'partner'
    if (body.user_id) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", body.user_id)
        .single();

      if (profileError || !profile) {
        return jsonResponse(
          { message: `User with ID ${body.user_id} not found` },
          400
        );
      }

      if (profile.role !== "partner") {
        return jsonResponse(
          {
            message: `User with ID ${body.user_id} does not have the 'partner' role`,
          },
          400
        );
      }
    }

    // Remove fields that shouldn't be updated directly
    const { id: _id, created_at: _ca, ...updateFields } = body;

    const { data: partner, error } = await supabase
      .from("partners")
      .update({
        ...updateFields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update partner ${id}: ${error.message}`);
      return jsonResponse({ message: "Failed to update partner" }, 500);
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "partner",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      newData: partner as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(partner);
  } catch (error) {
    return errorResponse(error);
  }
}
