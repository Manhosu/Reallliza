export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateRequest,
  checkRole,
  AuthError,
} from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * DELETE /api/os-projects/[id]
 * Remove um anexo (registro + storage). Apenas admin.
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

    const { data: row, error: findErr } = await supabase
      .from("os_projects")
      .select("id, service_order_id, file_url, file_name")
      .eq("id", id)
      .single();
    if (findErr || !row) {
      throw new AuthError(404, "Anexo não encontrado");
    }

    // Extrai o path do bucket a partir da signed URL ("...os-projects/os/<so>/<uuid>.ext?token=...").
    // Mais robusto: tentamos extrair "os/<so>/<uuid>.<ext>" antes do "?".
    const match = row.file_url?.match(/os-projects\/(os\/[^?]+)/);
    const path = match?.[1];
    if (path) {
      const { error: rmErr } = await supabase.storage
        .from("os-projects")
        .remove([path]);
      if (rmErr) {
        console.warn(`Failed to delete storage for ${id}: ${rmErr.message}`);
      }
    }

    const { error: delErr } = await supabase
      .from("os_projects")
      .delete()
      .eq("id", id);
    if (delErr) {
      throw new Error(`Falha ao deletar anexo: ${delErr.message}`);
    }

    logAudit({
      userId: user.id,
      action: "os_project.deleted",
      entityType: "os_project",
      entityId: id,
      oldData: { file_name: row.file_name },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
