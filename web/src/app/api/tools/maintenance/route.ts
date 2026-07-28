import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/tools/maintenance
 * Lista manutencoes. Query: ?tool_id=uuid | ?pending=1 (sem retorno).
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const supabase = getAdminClient();
    const sp = request.nextUrl.searchParams;
    let q = supabase
      .from("tool_maintenance")
      .select(
        `*, tool:tool_inventory(id, name, serial_number, patrimony_code),
         responsible:profiles!tool_maintenance_responsible_id_fkey(id, full_name)`
      )
      .order("created_at", { ascending: false });
    if (sp.get("tool_id")) q = q.eq("tool_id", sp.get("tool_id"));
    if (sp.get("pending") === "1") q = q.is("actual_return_at", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/tools/maintenance
 * Envia ferramenta pra manutencao. Body:
 *   { tool_id, reason, expected_return_at?, estimated_cost?, responsible_id?, notes?, photos? }
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
    const { data, error } = await supabase
      .from("tool_maintenance")
      .insert({
        tool_id: body.tool_id,
        reason: body.reason,
        expected_return_at: body.expected_return_at || null,
        estimated_cost: body.estimated_cost ?? null,
        responsible_id: body.responsible_id || null,
        notes: body.notes || null,
        photos: Array.isArray(body.photos) ? body.photos : [],
        created_by: user.id,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Muda status da ferramenta pra maintenance
    await supabase
      .from("tool_inventory")
      .update({ status: "maintenance" })
      .eq("id", body.tool_id);

    logAudit({
      userId: user.id,
      action: "tool.sent_to_maintenance",
      entityType: "tool",
      entityId: body.tool_id,
      newData: { reason: body.reason },
    });
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
