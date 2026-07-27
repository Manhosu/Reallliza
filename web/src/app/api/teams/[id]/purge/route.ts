import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/** DELETE /api/teams/[id]/purge — hard delete de equipe (D6). */
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
      .from("teams")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!t) throw new AuthError(404, "Equipe nao encontrada");
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) throw new Error(`Falha ao apagar equipe: ${error.message}`);
    logAudit({
      userId: user.id,
      action: "team.purged",
      entityType: "team",
      entityId: id,
      newData: { name: (t as { name: string }).name },
    });
    return jsonResponse({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
