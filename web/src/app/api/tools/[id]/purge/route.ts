import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * DELETE /api/tools/[id]/purge (D6 - Jessica 27/07).
 * Hard delete de ferramenta. Bloqueia se ferramenta em custodia ativa.
 * Cascata em tool_custody historico + tool_requests.
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
    const { data: t } = await supabase
      .from("tool_inventory")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!t) throw new AuthError(404, "Ferramenta nao encontrada");

    // Bloqueia se ha custodia ativa
    const { count: activeCount } = await supabase
      .from("tool_custody")
      .select("*", { count: "exact", head: true })
      .eq("tool_id", id)
      .is("checked_in_at", null);
    if (activeCount && activeCount > 0) {
      throw new AuthError(
        400,
        "Ferramenta em custodia ativa. Devolva antes de excluir."
      );
    }

    const { error } = await supabase
      .from("tool_inventory")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`Falha ao apagar ferramenta: ${error.message}`);

    logAudit({
      userId: user.id,
      action: "tool.purged",
      entityType: "tool",
      entityId: id,
      newData: { name: (t as { name: string }).name },
    });
    return jsonResponse({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
