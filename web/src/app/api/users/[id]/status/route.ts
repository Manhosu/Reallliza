import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      throw new AuthError(400, "Status is required");
    }

    const validStatuses = ["active", "inactive", "suspended"];
    if (!validStatuses.includes(status)) {
      throw new AuthError(
        400,
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    const supabase = getAdminClient();

    // Verify user exists
    const { data: existing, error: findError } = await supabase
      .from("profiles")
      .select("id, status")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `User with ID ${id} not found`);
    }

    const oldStatus = existing.status;

    // Update profile status
    const { data: profile, error } = await supabase
      .from("profiles")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update status for user ${id}: ${error.message}`);
      throw new Error("Failed to update user status");
    }

    // Handle auth state based on new status
    if (status === "inactive" || status === "suspended") {
      await supabase.auth.admin.updateUserById(id, {
        ban_duration: "none",
      });
    } else if (status === "active") {
      // Remove ban if reactivating
      await supabase.auth.admin.updateUserById(id, {
        ban_duration: "0",
      });
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "user.status_changed",
      entityType: "user",
      entityId: id,
      oldData: { status: oldStatus },
      newData: { status },
    });

    return jsonResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
