import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * PATCH /api/partners/[id]/activate
 * Activate a partner (set is_active = true).
 * Accessible by: admin only
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;

    const supabase = getAdminClient();

    // Verify the partner exists and check current status
    const { data: existing, error: findError } = await supabase
      .from("partners")
      .select("id, is_active")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return jsonResponse(
        { message: `Partner with ID ${id} not found` },
        404
      );
    }

    if (existing.is_active) {
      return jsonResponse(
        { message: "Partner is already active" },
        400
      );
    }

    const { data: partner, error } = await supabase
      .from("partners")
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Failed to activate partner ${id}: ${error.message}`);
      return jsonResponse({ message: "Failed to activate partner" }, 500);
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "ACTIVATE",
      entityType: "partner",
      entityId: id,
      oldData: { is_active: false },
      newData: { is_active: true },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(partner);
  } catch (error) {
    return errorResponse(error);
  }
}
