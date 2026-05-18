import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

function normalizeUf(value: unknown): string {
  return String(value || "").trim().toUpperCase().slice(0, 2);
}

/**
 * PATCH /api/regions/[id]
 * Atualiza nome/UF/ativo. Apenas admin.
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
        throw new AuthError(400, "Nome da região é obrigatório");
      }
      update.name = String(body.name).trim();
    }
    if (body.uf !== undefined) {
      const uf = normalizeUf(body.uf);
      if (uf.length !== 2) {
        throw new AuthError(400, "UF inválida");
      }
      update.uf = uf;
    }
    if (body.is_active !== undefined) {
      update.is_active = !!body.is_active;
    }

    if (Object.keys(update).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("regions")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AuthError(409, "Já existe uma região com esse nome e UF");
      }
      throw new Error("Falha ao atualizar região");
    }
    if (!data) {
      throw new AuthError(404, "Região não encontrada");
    }

    logAudit({
      userId: user.id,
      action: "region.updated",
      entityType: "region",
      entityId: id,
      newData: update,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/regions/[id]
 * Soft-delete: marca is_active=false.
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
      .from("regions")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      throw new Error("Falha ao desativar região");
    }

    logAudit({
      userId: user.id,
      action: "region.deactivated",
      entityType: "region",
      entityId: id,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
