import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * PATCH /api/checklists/[id]/complete
 * Mark a checklist as completed (set completed_at, completed_by).
 * Validates that all required items are checked before completing.
 * Supports optimistic locking via version field.
 * Authenticated users.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    // Parse optional version from body (body may be empty)
    let version: number | undefined;
    try {
      const body = await request.json();
      version = body.version;
    } catch {
      // No body or invalid JSON is acceptable for this endpoint
    }

    // Get the checklist with template info for required-item validation
    const { data: checklist, error: findError } = await supabase
      .from("checklists")
      .select(
        "*, template:checklist_templates(*)"
      )
      .eq("id", id)
      .single();

    if (findError || !checklist) {
      throw new AuthError(404, `Checklist with ID ${id} not found`);
    }

    if (checklist.completed_at) {
      return jsonResponse(
        { message: "Checklist is already completed" },
        400
      );
    }

    // Validate required items are checked
    const checklistItems = (checklist.data || []) as Array<{
      id: string;
      label: string;
      description?: string;
      checked: boolean;
      required?: boolean;
    }>;

    const templateItems = (checklist.template?.fields || []) as Array<{
      label: string;
      required: boolean;
    }>;

    // Build a set of required labels from the template
    const requiredLabels = new Set(
      templateItems.filter((i) => i.required).map((i) => i.label)
    );

    // Check that all required items are checked
    if (requiredLabels.size > 0) {
      const uncheckedRequired = checklistItems.filter(
        (item) => requiredLabels.has(item.label) && !item.checked
      );

      if (uncheckedRequired.length > 0) {
        const labels = uncheckedRequired
          .map((i) => i.label || i.description)
          .join(", ");
        return jsonResponse(
          {
            message: `Cannot complete checklist. The following required items are not checked: ${labels}`,
          },
          400
        );
      }
    }

    let completeQuery = supabase
      .from("checklists")
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Optimistic locking: only update if version matches
    if (version !== undefined) {
      completeQuery = completeQuery.eq("version", version);
    }

    const { data: updated, error } = await completeQuery.select().single();

    if (error) {
      // PGRST116 = "JSON object requested, multiple (or no) rows returned" -> 0 rows = version mismatch
      if (version !== undefined && error.code === "PGRST116") {
        return jsonResponse(
          {
            message:
              "Dados desatualizados. Recarregue a pagina e tente novamente.",
          },
          409
        );
      }
      console.error(`Failed to complete checklist ${id}: ${error.message}`);
      throw new Error("Failed to complete checklist");
    }

    logAudit({
      userId: user.id,
      action: "checklist.completed",
      entityType: "checklist",
      entityId: id,
      newData: {
        completed_at: updated.completed_at,
        completed_by: user.id,
      },
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
