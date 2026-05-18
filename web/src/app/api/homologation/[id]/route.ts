import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const VALID_STATUS = ["under_review", "approved", "rejected"];

/**
 * PATCH /api/homologation/[id]
 * Admin coloca em análise, aprova ou reprova uma solicitação.
 * Body: { status: 'under_review'|'approved'|'rejected', notes? }
 * Ao aprovar, marca o profissional como homologado.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();

    const status = typeof body.status === "string" ? body.status : "";
    if (!VALID_STATUS.includes(status)) {
      throw new AuthError(400, "Status inválido");
    }

    const supabase = getAdminClient();

    const { data: req, error } = await supabase
      .from("homologation_requests")
      .update({
        status,
        notes: typeof body.notes === "string" ? body.notes : null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("profile_id")
      .single();

    if (error || !req) {
      throw new AuthError(404, "Solicitação não encontrada");
    }

    // Reflete a decisão no profile.
    if (status === "approved") {
      await supabase
        .from("profiles")
        .update({
          is_homologated: true,
          homologated_at: new Date().toISOString(),
        })
        .eq("id", req.profile_id);
    } else if (status === "rejected") {
      await supabase
        .from("profiles")
        .update({ is_homologated: false, homologated_at: null })
        .eq("id", req.profile_id);
    }

    logAudit({
      userId: user.id,
      action: `homologation_request.${status}`,
      entityType: "homologation_request",
      entityId: id,
      newData: { status },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
