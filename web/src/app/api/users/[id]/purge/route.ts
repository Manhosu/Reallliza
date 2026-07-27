import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * DELETE /api/users/[id]/purge
 * Hard delete de usuario (Jessica 27/07 D6). Cascata em profiles + apaga
 * auth.users pra nao deixar orfao.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;

    if (id === user.id) {
      throw new AuthError(400, "Nao pode excluir voce mesmo");
    }

    const supabase = getAdminClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", id)
      .maybeSingle();
    if (!profile) throw new AuthError(404, "Usuario nao encontrado");

    // Cascata em profiles (FK CASCADE em team_members, technician_specialty_scores, etc)
    await supabase.from("profiles").delete().eq("id", id);
    // Apaga em auth.users
    try {
      await supabase.auth.admin.deleteUser(id);
    } catch (err) {
      console.warn(
        `purge user ${id}: auth.deleteUser failed (may already be deleted): ${err instanceof Error ? err.message : err}`
      );
    }

    logAudit({
      userId: user.id,
      action: "user.purged",
      entityType: "user",
      entityId: id,
      newData: profile as Record<string, unknown>,
    });

    return jsonResponse({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
