import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const EDITABLE_FIELDS = [
  "kind",
  "identification",
  "description",
  "unit",
  "unit_value",
  "quantity",
  "position",
];

/**
 * PATCH /api/service-orders/[id]/items/[itemId]
 * Edita campos do item. Apenas admin.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id, itemId } = await params;
    const body = await request.json();

    if (body.kind && !["S", "P"].includes(body.kind)) {
      throw new AuthError(400, "kind must be 'S' (servico) or 'P' (produto)");
    }

    const supabase = getAdminClient();

    const { data: existing, error: findErr } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("id", itemId)
      .eq("service_order_id", id)
      .single();

    if (findErr || !existing) {
      throw new AuthError(404, "Item not found");
    }

    const updatePayload: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        updatePayload[field] = body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new AuthError(400, "No valid fields to update");
    }

    const { data: item, error } = await supabase
      .from("service_order_items")
      .update(updatePayload)
      .eq("id", itemId)
      .eq("service_order_id", id)
      .select("*")
      .single();

    if (error) {
      console.error(`Failed to update item: ${error.message}`);
      throw new Error("Failed to update service order item");
    }

    logAudit({
      userId: user.id,
      action: "service_order_item.updated",
      entityType: "service_order_item",
      entityId: itemId,
      oldData: existing as Record<string, unknown>,
      newData: item as Record<string, unknown>,
    });

    return jsonResponse(item);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/service-orders/[id]/items/[itemId]
 * Remove um item. Apenas admin.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id, itemId } = await params;

    const supabase = getAdminClient();

    const { data: existing, error: findErr } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("id", itemId)
      .eq("service_order_id", id)
      .single();

    if (findErr || !existing) {
      throw new AuthError(404, "Item not found");
    }

    const { error } = await supabase
      .from("service_order_items")
      .delete()
      .eq("id", itemId)
      .eq("service_order_id", id);

    if (error) {
      console.error(`Failed to delete item: ${error.message}`);
      throw new Error("Failed to delete service order item");
    }

    logAudit({
      userId: user.id,
      action: "service_order_item.deleted",
      entityType: "service_order_item",
      entityId: itemId,
      oldData: existing as Record<string, unknown>,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
