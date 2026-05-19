import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/quotes/[id]
 * Detalhe de um orçamento com itens e pagamentos. Admin vê qualquer um;
 * partner só os da própria loja.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "partner"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("quotes")
      .select(
        `
        *,
        partner:partners(id, company_name, user_id),
        items:quote_items(*),
        payments(id, status, method, amount, checkout_url, created_at, paid_at)
      `
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new AuthError(404, "Orçamento não encontrado");
    }

    // Isolamento: partner só acessa orçamentos da própria loja.
    if (user.role === "partner") {
      const partner = data.partner as { user_id?: string } | null;
      if (!partner || partner.user_id !== user.id) {
        throw new AuthError(403, "Sem acesso a este orçamento");
      }
    }

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
