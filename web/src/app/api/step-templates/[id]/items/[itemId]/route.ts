import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id, itemId } = await params;
    const body = await request.json();
    const supabase = getAdminClient();

    const updatePayload: Record<string, unknown> = {};
    if (body.name !== undefined) updatePayload.name = String(body.name).trim();
    if (body.description !== undefined) updatePayload.description = body.description?.trim() || null;
    if (body.order_index !== undefined) updatePayload.order_index = body.order_index;
    if (body.photos_required_min !== undefined) updatePayload.photos_required_min = body.photos_required_min;
    if (body.final_photos_required_min !== undefined) updatePayload.final_photos_required_min = body.final_photos_required_min;
    if (body.occurrence_enabled !== undefined) updatePayload.occurrence_enabled = !!body.occurrence_enabled;
    if (body.is_required !== undefined) updatePayload.is_required = !!body.is_required;

    if (Object.keys(updatePayload).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const { data, error } = await supabase
      .from("step_template_items")
      .update(updatePayload)
      .eq("id", itemId)
      .eq("group_id", id)
      .select()
      .single();

    if (error || !data) {
      throw new AuthError(404, "Etapa não encontrada");
    }
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id, itemId } = await params;
    const supabase = getAdminClient();

    const { count } = await supabase
      .from("os_step_executions")
      .select("id", { count: "exact", head: true })
      .eq("template_item_id", itemId);

    if (count && count > 0) {
      throw new AuthError(
        409,
        "Etapa em uso por OS já provisionadas. Não pode ser excluída."
      );
    }

    const { error } = await supabase
      .from("step_template_items")
      .delete()
      .eq("id", itemId)
      .eq("group_id", id);

    if (error) throw new Error("Falha ao excluir etapa");
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
