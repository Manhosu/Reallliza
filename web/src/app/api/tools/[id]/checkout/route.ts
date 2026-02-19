import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * POST /api/tools/[id]/checkout
 * Checkout a tool to a technician.
 * Creates a tool_custody record and updates tool status to 'in_use'.
 * Admin and manager roles only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);
    const { id: toolId } = await params;

    const body = await request.json();
    const {
      user_id,
      service_order_id,
      expected_return_at,
      condition_out,
      notes_out,
    } = body;

    if (!user_id) {
      return jsonResponse(
        { message: "user_id is required (technician to assign the tool to)" },
        400
      );
    }

    const supabase = getAdminClient();

    // Verify tool exists and is available
    const { data: tool, error: findError } = await supabase
      .from("tool_inventory")
      .select("id, status, name")
      .eq("id", toolId)
      .single();

    if (findError || !tool) {
      return jsonResponse(
        { message: `Tool with ID ${toolId} not found` },
        404
      );
    }

    if (tool.status !== "available") {
      return jsonResponse(
        {
          message: `Tool "${tool.name}" is not available for checkout. Current status: ${tool.status}`,
        },
        400
      );
    }

    // Create custody record
    const { data: custody, error: custodyError } = await supabase
      .from("tool_custody")
      .insert({
        tool_id: toolId,
        user_id,
        service_order_id: service_order_id || null,
        checked_out_at: new Date().toISOString(),
        condition_out: condition_out || "good",
        notes_out: notes_out || null,
      })
      .select()
      .single();

    if (custodyError) {
      console.error(
        `Failed to create custody record: ${custodyError.message}`
      );
      throw new Error("Failed to create custody record");
    }

    // Update tool status to in_use
    const { error: updateError } = await supabase
      .from("tool_inventory")
      .update({
        status: "in_use",
        updated_at: new Date().toISOString(),
      })
      .eq("id", toolId);

    if (updateError) {
      console.error(
        `Failed to update tool status: ${updateError.message}`
      );
      throw new Error("Failed to update tool status");
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "checkout",
      entityType: "tool_custody",
      entityId: custody.id,
      newData: custody as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    // Notify the technician about the tool assignment
    try {
      await createNotification(
        user_id,
        "Ferramenta atribuida",
        `A ferramenta "${tool.name}" foi atribuida a voce`,
        "tool_overdue",
        { tool_id: toolId, custody_id: custody.id }
      );
    } catch {
      // Notification failure should not break the main operation
    }

    return jsonResponse(custody, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
