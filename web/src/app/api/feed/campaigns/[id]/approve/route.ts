import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/feed/campaigns/[id]/approve
 *
 * Aprovação editorial — é o controle da Reallliza sobre o que vai ao ar.
 * Exigida mesmo para a conta-casa (a isenção dela é só financeira). Recusa
 * se o pagamento ainda está pendente: aprovar antes de pagar inverteria o
 * fluxo pedido.
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

    const { data: campanha, error } = await supabase
      .from("feed_campaigns")
      .select("id, payment_status, approval_status")
      .eq("id", id)
      .maybeSingle();
    if (error || !campanha) throw new AuthError(404, "Campanha não encontrada");

    if (campanha.payment_status === "pending") {
      throw new AuthError(402, "Esta campanha ainda não teve o pagamento confirmado.");
    }
    if (campanha.approval_status === "approved") {
      throw new AuthError(400, "Esta campanha já está aprovada.");
    }

    const { data: atualizada, error: errUp } = await supabase
      .from("feed_campaigns")
      .update({
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        rejection_reason: null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (errUp) throw new Error(errUp.message);

    logAudit({
      userId: user.id,
      action: "feed_campaign.approved",
      entityType: "feed_campaign",
      entityId: id,
    });

    return jsonResponse(atualizada);
  } catch (error) {
    return errorResponse(error);
  }
}
