import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/tools/[id]
 * Get a single tool by ID with current active custody info.
 * Accessible by all authenticated users.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: tool, error } = await supabase
      .from("tool_inventory")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !tool) {
      return jsonResponse({ message: `Tool with ID ${id} not found` }, 404);
    }

    // Get current active custody (if any)
    const { data: activeCustody } = await supabase
      .from("tool_custody")
      .select(
        `
        *,
        user:profiles!tool_custody_user_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!tool_custody_service_order_id_fkey(id, order_number, title)
      `
      )
      .eq("tool_id", id)
      .is("checked_in_at", null)
      .order("checked_out_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return jsonResponse({
      ...tool,
      current_custody: activeCustody || null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/tools/[id]
 * Update a tool in inventory.
 * Admin-only.
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

    // Verify the tool exists
    const { data: existing, error: findError } = await supabase
      .from("tool_inventory")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return jsonResponse({ message: `Tool with ID ${id} not found` }, 404);
    }

    // Map DTO fields to DB column names
    const { image_url, purchase_value, ...rest } = body;
    const updateData: Record<string, unknown> = {
      ...rest,
      updated_at: new Date().toISOString(),
    };
    if (image_url !== undefined) updateData.photo_url = image_url;

    const { data: tool, error } = await supabase
      .from("tool_inventory")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update tool ${id}: ${error.message}`);
      throw new Error("Failed to update tool");
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "update",
      entityType: "tool_inventory",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      newData: tool as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(tool);
  } catch (error) {
    return errorResponse(error);
  }
}
