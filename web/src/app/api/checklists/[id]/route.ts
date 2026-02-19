import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/checklists/[id]
 * Get a single checklist by ID with its items, template info, and completed_by user.
 * Authenticated users.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: checklist, error } = await supabase
      .from("checklists")
      .select(
        `
        *,
        template:checklist_templates(id, name, description),
        technician:profiles(id, full_name)
      `
      )
      .eq("id", id)
      .single();

    if (error || !checklist) {
      throw new AuthError(404, `Checklist with ID ${id} not found`);
    }

    return jsonResponse(checklist);
  } catch (error) {
    return errorResponse(error);
  }
}
