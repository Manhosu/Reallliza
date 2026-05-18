import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/quality-evaluations/[id]
 * Detalhe de uma avaliação de qualidade com os scores do checklist.
 * RBAC admin/manager.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("quality_evaluations")
      .select(
        `
        *,
        technician:profiles!technician_id(id, full_name),
        specialty:specialties(id, name),
        service_order:service_orders(id, order_number, client_name),
        scores:quality_evaluation_scores(*)
      `
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new AuthError(404, "Avaliação não encontrada");
    }

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
