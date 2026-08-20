import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/feed/campaigns/[id]/reject
 * Body: { reason: string }
 *
 * Reprovar não muda `status` da campanha — ela continua em draft, editável.
 * Ao reenviar (o próprio PATCH de edição já zera `approval_status` para
 * "pending"), o ciclo aprovar/reprovar recomeça sem precisar recriar nada.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();
    const body = await request.json().catch(() => ({}));

    const motivo = String(body.reason ?? "").trim();
    if (!motivo) throw new AuthError(400, "Informe o motivo da reprovação.");

    const { data: campanha, error } = await supabase
      .from("feed_campaigns")
      .select("id, approval_status")
      .eq("id", id)
      .maybeSingle();
    if (error || !campanha) throw new AuthError(404, "Campanha não encontrada");

    if (campanha.approval_status !== "pending") {
      throw new AuthError(400, "Só é possível reprovar uma campanha aguardando aprovação.");
    }

    const { data: atualizada, error: errUp } = await supabase
      .from("feed_campaigns")
      .update({ approval_status: "rejected", rejection_reason: motivo })
      .eq("id", id)
      .select("*")
      .single();
    if (errUp) throw new Error(errUp.message);

    logAudit({
      userId: user.id,
      action: "feed_campaign.rejected",
      entityType: "feed_campaign",
      entityId: id,
      newData: { reason: motivo },
    });

    return jsonResponse(atualizada);
  } catch (error) {
    return errorResponse(error);
  }
}
