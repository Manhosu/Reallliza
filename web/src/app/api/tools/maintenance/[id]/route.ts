import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * PATCH /api/tools/maintenance/[id]
 * Finaliza manutencao. Body:
 *   { outcome: 'returned_available' | 'retired', final_cost?, outcome_notes?, photos? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "almoxarifado"]);
    const { id } = await params;
    const body = await request.json();
    if (!body.outcome) throw new AuthError(400, "outcome obrigatorio");

    const supabase = getAdminClient();
    const { data: m } = await supabase
      .from("tool_maintenance")
      .select("id, tool_id, actual_return_at")
      .eq("id", id)
      .maybeSingle();
    if (!m) throw new AuthError(404, "Manutencao nao encontrada");
    if ((m as { actual_return_at: string | null }).actual_return_at) {
      throw new AuthError(400, "Manutencao ja finalizada");
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("tool_maintenance")
      .update({
        actual_return_at: nowIso,
        outcome: body.outcome,
        final_cost: body.final_cost ?? null,
        outcome_notes: body.outcome_notes || null,
        photos: Array.isArray(body.photos)
          ? body.photos
          : undefined,
        updated_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Atualiza status da ferramenta
    const newToolStatus =
      body.outcome === "retired" ? "retired" : "available";
    await supabase
      .from("tool_inventory")
      .update({ status: newToolStatus })
      .eq("id", (m as { tool_id: string }).tool_id);

    // Se aposentou, cria registro em tool_retirements
    if (body.outcome === "retired") {
      await supabase.from("tool_retirements").insert({
        tool_id: (m as { tool_id: string }).tool_id,
        reason: body.outcome_notes || "Baixa apos manutencao",
        responsible_id: user.id,
        created_by: user.id,
      });
    }

    logAudit({
      userId: user.id,
      action: "tool.maintenance_finished",
      entityType: "tool_maintenance",
      entityId: id,
      newData: { outcome: body.outcome },
    });
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
