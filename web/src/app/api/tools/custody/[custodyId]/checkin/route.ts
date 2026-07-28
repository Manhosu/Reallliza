import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/tools/custody/[custodyId]/checkin
 * Return a tool (check in from custody).
 * Updates the tool_custody record with returned_at timestamp,
 * and sets tool status back to 'available' (or 'maintenance' if condition is poor/damaged).
 * Admin and manager roles only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ custodyId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);
    const { custodyId } = await params;

    const body = await request.json();
    const { condition_in, notes_in, photos_in, new_status } = body as {
      condition_in?: string;
      notes_in?: string;
      photos_in?: Array<{ url: string; name: string; storage_path?: string }>;
      new_status?: string; // Jessica 28/07: operador escolhe o destino da ferramenta
    };

    if (!condition_in) {
      return jsonResponse(
        {
          message:
            "condition_in is required (good, fair, poor, damaged)",
        },
        400
      );
    }

    const supabase = getAdminClient();

    // Get the custody record
    const { data: custody, error: findError } = await supabase
      .from("tool_custody")
      .select("id, tool_id, checked_in_at")
      .eq("id", custodyId)
      .single();

    if (findError || !custody) {
      return jsonResponse(
        { message: `Custody record with ID ${custodyId} not found` },
        404
      );
    }

    if (custody.checked_in_at) {
      return jsonResponse(
        { message: "This tool has already been checked in" },
        400
      );
    }

    // Update custody record with check-in info
    const { data: updatedCustody, error: updateCustodyError } = await supabase
      .from("tool_custody")
      .update({
        checked_in_at: new Date().toISOString(),
        condition_in,
        notes_in: notes_in || null,
        photos_in: Array.isArray(photos_in) ? photos_in : [],
        received_by: user.id,
      })
      .eq("id", custodyId)
      .select()
      .single();

    if (updateCustodyError) {
      console.error(
        `Failed to update custody record: ${updateCustodyError.message}`
      );
      throw new Error("Failed to update custody record");
    }

    // Jessica 28/07: se operador escolheu status explicito, respeita.
    // Senao, aplica regra: poor/damaged -> maintenance, resto -> available.
    const VALID_STATUSES = [
      "available",
      "maintenance",
      "retired",
      "damaged",
      "awaiting_evaluation",
      "missing",
    ];
    const newStatus =
      new_status && VALID_STATUSES.includes(new_status)
        ? new_status
        : condition_in === "poor" || condition_in === "damaged"
          ? "maintenance"
          : "available";

    // Update tool status and condition
    const { error: updateToolError } = await supabase
      .from("tool_inventory")
      .update({
        status: newStatus,
        condition: condition_in,
        updated_at: new Date().toISOString(),
      })
      .eq("id", custody.tool_id);

    if (updateToolError) {
      console.error(
        `Failed to update tool status: ${updateToolError.message}`
      );
      throw new Error("Failed to update tool status");
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "checkin",
      entityType: "tool_custody",
      entityId: custodyId,
      newData: updatedCustody as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(updatedCustody);
  } catch (error) {
    return errorResponse(error);
  }
}
