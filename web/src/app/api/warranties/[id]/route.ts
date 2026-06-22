import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/warranties/[id] — detalhe.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranties")
      .select(
        "*, service_order:service_orders(id, order_number, title, client_name, completed_at, technician_id), opened_by_user:profiles!warranties_opened_by_fkey(full_name)"
      )
      .eq("id", id)
      .single();

    if (error || !data) throw new AuthError(404, "Garantia nao encontrada");

    // Loja so ve as proprias
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const partnerId = (p as { id?: string } | null)?.id;
      if (partnerId !== (data as { partner_id: string }).partner_id) {
        throw new AuthError(403, "Sem permissao");
      }
    }

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/warranties/[id]
 * Admin atualiza status / notas / converte em OS de assistencia.
 *
 * Body: { status?, resolution_notes?, assistance_service_order_id? }
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
    if (body.status !== undefined) {
      const valid = ["open", "in_progress", "resolved", "rejected"];
      if (!valid.includes(body.status)) {
        throw new AuthError(400, "status invalido");
      }
      update.status = body.status;
      if (body.status === "resolved" || body.status === "rejected") {
        update.resolved_at = new Date().toISOString();
        update.resolved_by = user.id;
      }
    }
    if (body.resolution_notes !== undefined) {
      update.resolution_notes = body.resolution_notes
        ? String(body.resolution_notes).slice(0, 2000)
        : null;
    }
    if (body.assistance_service_order_id !== undefined) {
      update.assistance_service_order_id = body.assistance_service_order_id || null;
    }
    if (body.notes !== undefined) {
      update.notes = body.notes ? String(body.notes).slice(0, 1000) : null;
    }

    if (Object.keys(update).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("warranties")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) throw new Error("Falha ao atualizar garantia");

    logAudit({
      userId: user.id,
      action: "warranty.updated",
      entityType: "warranty",
      entityId: id,
      newData: update,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
