import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * PATCH /api/service-categories/[id]
 * Atualiza nome/descrição/ordem/ativo. Apenas admin.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) {
        throw new AuthError(400, "Nome da categoria é obrigatório");
      }
      update.name = String(body.name).trim();
    }
    if (body.description !== undefined) {
      update.description = body.description?.trim() || null;
    }
    if (body.order_index !== undefined) {
      update.order_index = Number(body.order_index) || 0;
    }
    if (body.is_active !== undefined) {
      update.is_active = !!body.is_active;
    }
    // Jessica 20/07 Fase 2: vinculo com templates de checklist e steps
    if (body.checklist_template_id !== undefined) {
      update.checklist_template_id = body.checklist_template_id || null;
    }
    if (body.step_template_group_id !== undefined) {
      update.step_template_group_id = body.step_template_group_id || null;
    }

    if (Object.keys(update).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("service_categories")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AuthError(409, "Já existe uma categoria com esse nome");
      }
      throw new Error("Falha ao atualizar categoria");
    }
    if (!data) {
      throw new AuthError(404, "Categoria não encontrada");
    }

    logAudit({
      userId: user.id,
      action: "service_category.updated",
      entityType: "service_category",
      entityId: id,
      newData: update,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/service-categories/[id]
 * Soft-delete: marca is_active=false. Serviços da categoria continuam,
 * apenas ficam sem categoria na listagem (category_id permanece).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { error } = await supabase
      .from("service_categories")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      throw new Error("Falha ao desativar categoria");
    }

    logAudit({
      userId: user.id,
      action: "service_category.deactivated",
      entityType: "service_category",
      entityId: id,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
