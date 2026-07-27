import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * DELETE /api/partners/[id]/purge
 * Hard delete do parceiro com cascade forte (Jessica 27/07 D6).
 * quotes CASCADE, warranties SET NULL, service_orders SET NULL.
 * FKs do banco fazem a maior parte do trabalho.
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
    const { data: p, error: getErr } = await supabase
      .from("partners")
      .select("id, company_name, user_id")
      .eq("id", id)
      .maybeSingle();
    if (getErr || !p) throw new AuthError(404, "Parceiro nao encontrado");

    const { error: delErr } = await supabase
      .from("partners")
      .delete()
      .eq("id", id);
    if (delErr) throw new Error(`Falha ao apagar parceiro: ${delErr.message}`);

    logAudit({
      userId: user.id,
      action: "partner.purged",
      entityType: "partner",
      entityId: id,
      newData: { company_name: (p as { company_name: string }).company_name },
    });

    return jsonResponse({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
