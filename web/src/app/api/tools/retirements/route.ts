import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/** GET /api/tools/retirements — lista baixas ordenadas por data desc. */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("tool_retirements")
      .select(
        `*, tool:tool_inventory(id, name, serial_number, patrimony_code, brand, model),
         responsible:profiles!tool_retirements_responsible_id_fkey(id, full_name)`
      )
      .order("retired_at", { ascending: false });
    if (error) throw new Error(error.message);
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/tools/retirements
 * Baixa/aposenta ferramenta. Body: { tool_id, reason, notes?, photos?, responsible_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);
    const body = await request.json();
    if (!body.tool_id || !body.reason) {
      throw new AuthError(400, "tool_id e reason obrigatorios");
    }
    const supabase = getAdminClient();
    // Bloqueia se ferramenta em custodia ativa
    const { count } = await supabase
      .from("tool_custody")
      .select("*", { count: "exact", head: true })
      .eq("tool_id", body.tool_id)
      .is("checked_in_at", null);
    if (count && count > 0) {
      throw new AuthError(
        400,
        "Ferramenta em custodia ativa. Devolva antes de baixar."
      );
    }
    const { data, error } = await supabase
      .from("tool_retirements")
      .insert({
        tool_id: body.tool_id,
        reason: body.reason,
        notes: body.notes || null,
        photos: Array.isArray(body.photos) ? body.photos : [],
        responsible_id: body.responsible_id || user.id,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("tool_inventory")
      .update({ status: "retired" })
      .eq("id", body.tool_id);

    logAudit({
      userId: user.id,
      action: "tool.retired",
      entityType: "tool",
      entityId: body.tool_id,
      newData: { reason: body.reason },
    });
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
