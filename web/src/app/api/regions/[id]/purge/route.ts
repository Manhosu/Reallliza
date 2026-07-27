import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/** DELETE /api/regions/[id]/purge (D6). Sem FKs, seguro. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();
    const { data: r } = await supabase
      .from("regions")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!r) throw new AuthError(404, "Regiao nao encontrada");
    const { error } = await supabase.from("regions").delete().eq("id", id);
    if (error) throw new Error(`Falha ao apagar regiao: ${error.message}`);
    logAudit({
      userId: user.id,
      action: "region.purged",
      entityType: "region",
      entityId: id,
      newData: { name: (r as { name: string }).name },
    });
    return jsonResponse({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
