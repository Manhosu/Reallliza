import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/feed/campaigns/[id]/pay
 *
 * Confirmação MANUAL — mesmo padrão do ramo sem-Asaas de `quotes/[id]/pay`.
 * PIX automático via Asaas é Fase 2; aqui o admin confirma que recebeu o
 * pagamento por fora (a campanha continua bloqueada de ir ao ar até isso
 * acontecer — ver o portão em `POST /feed/[id]/publish`).
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
      .select("id, payment_status, total_price_cents")
      .eq("id", id)
      .maybeSingle();
    if (error || !campanha) throw new AuthError(404, "Campanha não encontrada");

    if (campanha.payment_status === "waived") {
      throw new AuthError(400, "Esta campanha é da loja Reallliza — não cobra, não precisa confirmar pagamento.");
    }
    if (campanha.payment_status === "paid") {
      throw new AuthError(400, "Esta campanha já está marcada como paga.");
    }

    const agora = new Date().toISOString();
    const { data: atualizada, error: errUp } = await supabase
      .from("feed_campaigns")
      .update({
        payment_status: "paid",
        paid_at: agora,
        paid_amount_cents: campanha.total_price_cents,
        payment_confirmed_by: user.id,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (errUp) throw new Error(errUp.message);

    logAudit({
      userId: user.id,
      action: "feed_campaign.paid",
      entityType: "feed_campaign",
      entityId: id,
      newData: { amount_cents: campanha.total_price_cents },
    });

    return jsonResponse(atualizada);
  } catch (error) {
    return errorResponse(error);
  }
}
