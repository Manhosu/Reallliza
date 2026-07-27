import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/** DELETE /api/specialties/[id]/purge (D6). Pre-apaga specialty_checklist_items (RESTRICT). */
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
      .from("specialties")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!s) throw new AuthError(404, "Especialidade nao encontrada");
    await supabase
      .from("specialty_checklist_items")
      .delete()
      .eq("specialty_id", id);
    const { error } = await supabase
      .from("specialties")
      .delete()
      .eq("id", id);
    if (error)
      throw new Error(`Falha ao apagar especialidade: ${error.message}`);
    logAudit({
      userId: user.id,
      action: "specialty.purged",
      entityType: "specialty",
      entityId: id,
      newData: { name: (s as { name: string }).name },
    });
    return jsonResponse({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
