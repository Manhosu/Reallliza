import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * PUT /api/checklists/[id]/items
 * Update checklist items (mark items as completed with checked, notes, photo_url).
 * Supports optimistic locking via version field.
 * Authenticated users.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const body = await request.json();
    const { items, version } = body;

    if (!items || !Array.isArray(items)) {
      return jsonResponse(
        { message: "items array is required" },
        400
      );
    }

    const supabase = getAdminClient();

    // Verify the checklist exists and is not completed
    const { data: existing, error: findError } = await supabase
      .from("checklists")
      .select("id, completed_at, items")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `Checklist with ID ${id} not found`);
    }

    if (existing.completed_at) {
      return jsonResponse(
        { message: "Cannot update items of a completed checklist" },
        400
      );
    }

    let query = supabase
      .from("checklists")
      .update({
        items,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Optimistic locking: only update if version matches
    if (version !== undefined) {
      query = query.eq("version", version);
    }

    const { data: checklist, error } = await query.select().single();

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
      console.error(
        `Failed to update checklist items ${id}: ${error.message}`
      );
      throw new Error("Failed to update checklist items");
    }

    logAudit({
      userId: user.id,
      action: "checklist.items_updated",
      entityType: "checklist",
      entityId: id,
      oldData: { items: existing.items },
      newData: { items },
    });

    return jsonResponse(checklist);
  } catch (error) {
    return errorResponse(error);
  }
}
