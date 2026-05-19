import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { convertQuoteToServiceOrder } from "@/lib/quotes/convert-to-os";

/**
 * POST /api/quotes/[id]/confirm-payment
 * Confirmação manual do pagamento de um orçamento. Apenas admin —
 * usado quando o Asaas não está configurado. Converte o orçamento em OS.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("id, status")
      .eq("id", id)
      .single();

    if (error || !quote) {
      throw new AuthError(404, "Orçamento não encontrado");
    }
    if (quote.status === "converted") {
      return jsonResponse({ success: true, already: true });
    }
    if (quote.status === "cancelled") {
      throw new AuthError(400, "Orçamento cancelado");
    }

    const now = new Date().toISOString();

    // Confirma o pagamento pendente (se houver).
    await supabase
      .from("payments")
      .update({ status: "confirmed", paid_at: now })
      .eq("quote_id", id)
      .eq("status", "pending");

    await supabase
      .from("quotes")
      .update({ status: "paid", paid_at: now })
      .eq("id", id);

    const result = await convertQuoteToServiceOrder(supabase, id);
    if (!result.ok) {
      throw new Error(result.error || "Falha ao converter o orçamento");
    }

    logAudit({
      userId: user.id,
      action: "quote.payment_confirmed_manual",
      entityType: "quote",
      entityId: id,
      newData: { service_order_id: result.service_order_id },
    });

    return jsonResponse({
      success: true,
      service_order_id: result.service_order_id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
