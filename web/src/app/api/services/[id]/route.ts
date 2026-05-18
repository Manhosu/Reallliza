import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

function parsePrice(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * GET /api/services/[id]
 * Detalhe de um serviço do catálogo.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("services")
      .select("*, category:service_categories(id, name)")
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new AuthError(404, "Serviço não encontrado");
    }
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/services/[id]
 * Atualiza um serviço (nome, categoria, unidade, preços, ativo). Apenas admin.
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
        throw new AuthError(400, "Nome do serviço é obrigatório");
      }
      update.name = String(body.name).trim();
    }
    if (body.description !== undefined) {
      update.description = body.description?.trim() || null;
    }
    if (body.category_id !== undefined) {
      update.category_id = body.category_id || null;
    }
    if (body.unit !== undefined) {
      update.unit = String(body.unit).trim() || "m2";
    }
    if (body.commercial_price !== undefined) {
      update.commercial_price = parsePrice(body.commercial_price);
    }
    if (body.payout_price !== undefined) {
      update.payout_price = parsePrice(body.payout_price);
    }
    if (body.is_active !== undefined) {
      update.is_active = !!body.is_active;
    }

    if (Object.keys(update).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("services")
      .update(update)
      .eq("id", id)
      .select("*, category:service_categories(id, name)")
      .single();

    if (error) {
      throw new Error("Falha ao atualizar serviço");
    }
    if (!data) {
      throw new AuthError(404, "Serviço não encontrado");
    }

    logAudit({
      userId: user.id,
      action: "service.updated",
      entityType: "service",
      entityId: id,
      newData: update,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/services/[id]
 * Soft-delete: marca is_active=false. Mantém o histórico de OS/orçamentos.
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
      .from("services")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      throw new Error("Falha ao desativar serviço");
    }

    logAudit({
      userId: user.id,
      action: "service.deactivated",
      entityType: "service",
      entityId: id,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
