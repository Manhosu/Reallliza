import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { provisionSteps } from "../provision-steps/route";

/**
 * GET /api/service-orders/[id]/steps
 * Lista as execuções de etapas (os_step_executions) da OS,
 * ordenadas por order_index.
 *
 * Auto-provisiona se a OS tem step_template_group_id vinculado mas
 * nenhuma execução foi criada ainda — assim o técnico nunca cai num
 * "nenhuma etapa" quando o admin já anexou o template.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    // Verifica acesso à OS (técnico só vê as suas)
    const { data: order, error: orderErr } = await supabase
      .from("service_orders")
      .select("id, technician_id, step_template_group_id")
      .eq("id", id)
      .single();

    if (orderErr || !order) {
      throw new AuthError(404, "OS não encontrada");
    }

    if (user.role === "technician" && order.technician_id !== user.id) {
      throw new AuthError(403, "Sem permissão para ver as etapas desta OS");
    }

    const { data: existing } = await supabase
      .from("os_step_executions")
      .select("*")
      .eq("service_order_id", id)
      .order("order_index", { ascending: true });

    // Auto-provision: tem template mas nenhuma execução → provisiona agora.
    if (
      (!existing || existing.length === 0) &&
      order.step_template_group_id
    ) {
      try {
        await provisionSteps(supabase, id, order.step_template_group_id);
        const { data: provisioned } = await supabase
          .from("os_step_executions")
          .select("*")
          .eq("service_order_id", id)
          .order("order_index", { ascending: true });
        return jsonResponse(provisioned ?? []);
      } catch (provisionError) {
        console.error(
          `Auto-provision failed for OS ${id}:`,
          provisionError
        );
        // Cai pro retorno vazio — UI lida com array vazio.
      }
    }

    return jsonResponse(existing ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}
