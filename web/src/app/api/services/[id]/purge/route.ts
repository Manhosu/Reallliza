import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * DELETE /api/services/[id]/purge (D6).
 * Pre-apaga service_order_items (RESTRICT) e quote_items pra cascade real.
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
    const { data: s } = await supabase
      .from("services")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!s) throw new AuthError(404, "Servico nao encontrado");

    // Pre-apaga dependentes RESTRICT
    await supabase.from("service_order_items").delete().eq("service_id", id);
    await supabase.from("quote_items").delete().eq("service_id", id);

    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) throw new Error(`Falha ao apagar servico: ${error.message}`);

    logAudit({
      userId: user.id,
      action: "service.purged",
      entityType: "service",
      entityId: id,
      newData: { name: (s as { name: string }).name },
    });
    return jsonResponse({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
