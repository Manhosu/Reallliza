import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateRequest,
  checkRole,
  AuthError,
} from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * PATCH /api/checklists/templates/[id]/deactivate
 * Deactivate a checklist template by setting is_active = false.
 * Admin only.
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

    // Verify the template exists
    const { data: existing, error: findError } = await supabase
      .from("checklist_templates")
      .select("id, is_active")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `Checklist template with ID ${id} not found`);
    }

    if (!existing.is_active) {
      return jsonResponse(
        { message: "Template is already deactivated" },
        400
      );
    }

    const { data: template, error } = await supabase
      .from("checklist_templates")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to deactivate checklist template ${id}: ${error.message}`
      );
      throw new Error("Failed to deactivate checklist template");
    }

    logAudit({
      userId: user.id,
      action: "checklist_template.deactivated",
      entityType: "checklist_template",
      entityId: id,
      oldData: { is_active: true },
      newData: { is_active: false },
    });

    return jsonResponse(template);
  } catch (error) {
    return errorResponse(error);
  }
}
