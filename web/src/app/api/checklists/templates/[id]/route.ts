import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateRequest,
  checkRole,
  AuthError,
} from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { randomUUID } from "crypto";

/**
 * GET /api/checklists/templates/[id]
 * Get a single checklist template by ID with its items.
 * Authenticated users can view templates.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: template, error } = await supabase
      .from("checklist_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !template) {
      throw new AuthError(404, `Checklist template with ID ${id} not found`);
    }

    return jsonResponse(template);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/checklists/templates/[id]
 * Update a checklist template.
 * Admin only.
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

    // Verify the template exists and get old data for audit
    const { data: existing, error: findError } = await supabase
      .from("checklist_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `Checklist template with ID ${id} not found`);
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      updateData.name = body.name;
    }

    if (body.description !== undefined) {
      updateData.description = body.description;
    }

    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }

    if (body.items !== undefined) {
      updateData.fields = body.items.map(
        (
          item: { label?: string; description?: string; order?: number; required?: boolean },
          index: number
        ) => ({
          id: randomUUID(),
          description: item.label || item.description || "",
          label: item.label || item.description || "",
          required: item.required ?? false,
          order: item.order ?? index,
        })
      );
    }

    const { data: template, error } = await supabase
      .from("checklist_templates")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(
        `Failed to update checklist template ${id}: ${error.message}`
      );
      throw new Error("Failed to update checklist template");
    }

    logAudit({
      userId: user.id,
      action: "checklist_template.updated",
      entityType: "checklist_template",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      newData: template as Record<string, unknown>,
    });

    return jsonResponse(template);
  } catch (error) {
    return errorResponse(error);
  }
}
