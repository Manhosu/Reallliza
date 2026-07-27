import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/** DELETE /api/service-categories/[id]/purge (D6). Services.category_id SET NULL. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();
    const { data: c } = await supabase
      .from("service_categories")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (!c) throw new AuthError(404, "Categoria nao encontrada");
    const { error } = await supabase
      .from("service_categories")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`Falha ao apagar categoria: ${error.message}`);
    logAudit({
      userId: user.id,
      action: "service_category.purged",
      entityType: "service_category",
      entityId: id,
      newData: { name: (c as { name: string }).name },
    });
    return jsonResponse({ success: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
