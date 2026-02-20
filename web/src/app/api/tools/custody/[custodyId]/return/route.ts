import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * PATCH /api/tools/custody/[custodyId]/return
 * Return a tool (check in from custody).
 * Accessible by the technician who has the tool, or admin/manager.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ custodyId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { custodyId } = await params;

    const body = await request.json();
    const { condition_in, notes_in } = body;

    const supabase = getAdminClient();

    // Get the custody record
    const { data: custody, error: findError } = await supabase
      .from("tool_custody")
      .select("id, tool_id, user_id, checked_in_at")
      .eq("id", custodyId)
      .single();

    if (findError || !custody) {
      return jsonResponse(
        { message: `Custody record with ID ${custodyId} not found` },
        404
      );
    }

    // Only the assigned user or admin/manager can return
    if (user.role === "technician" && custody.user_id !== user.id) {
      return jsonResponse(
        { message: "You can only return tools assigned to you" },
        403
      );
    }

    if (custody.checked_in_at) {
      return jsonResponse(
        { message: "This tool has already been returned" },
        400
      );
    }

    // Update custody record
    const { data: updatedCustody, error: updateError } = await supabase
      .from("tool_custody")
      .update({
        checked_in_at: new Date().toISOString(),
        condition_in: condition_in || "good",
        notes_in: notes_in || null,
      })
      .eq("id", custodyId)
      .select()
      .single();

    if (updateError) {
      console.error(`Failed to return tool: ${updateError.message}`);
      throw new Error("Failed to return tool");
    }

    // Update tool status
    const newStatus =
      condition_in === "poor" || condition_in === "damaged"
        ? "maintenance"
        : "available";

    await supabase
      .from("tool_inventory")
      .update({
        status: newStatus,
        condition: condition_in || "good",
        updated_at: new Date().toISOString(),
      })
      .eq("id", custody.tool_id);

    logAudit({
      userId: user.id,
      action: "tool.returned",
      entityType: "tool_custody",
      entityId: custodyId,
      newData: updatedCustody as Record<string, unknown>,
    });

    return jsonResponse(updatedCustody);
  } catch (error) {
    return errorResponse(error);
  }
}
