import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/relatorio/[code]
 * Verificação PÚBLICA (sem autenticação) do Relatório Técnico de Execução
 * e Termo de Garantia — quem escaneia o QR ou abre o link cai aqui.
 *
 * Diferente do certificate_code de cursos (determinístico, só decorativo —
 * nunca teve rota pra consultar), este código é aleatório e olha de
 * verdade pro banco, então "verificar autenticidade" aqui é real.
 *
 * Retorna só o essencial pra confirmar autenticidade — nada de endereço,
 * telefone ou documento do cliente.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const supabase = getAdminClient();

    const { data: order, error } = await supabase
      .from("service_orders")
      .select("id, order_number, title, status, client_name, completed_at, report_code, report_issued_at")
      .eq("report_code", code)
      .maybeSingle();

    if (error || !order) {
      return jsonResponse({ valid: false });
    }

    return jsonResponse({
      valid: true,
      order_number: order.order_number,
      title: order.title,
      client_name: order.client_name,
      completed_at: order.completed_at,
      issued_at: order.report_issued_at,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
