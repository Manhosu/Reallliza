import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/service-orders/[id]/approve
 * Aprova a OS, registrando aprovado_em e aprovado_por (modelo Cenize).
 * Idempotente: se ja aprovada, retorna 200 com a OS atual.
 *
 * Adicionalmente, se a OS estiver em status 'completed', faz a transicao
 * para 'invoiced' (compatibilidade com fluxo financeiro existente).
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

    const { data: order, error: findError } = await supabase
      .from("service_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    // Idempotente: se ja aprovada, retorna a OS atual
    if (order.aprovado_em) {
      return jsonResponse({
        ...order,
        already_approved: true,
      });
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      aprovado_em: now,
      aprovado_por: user.full_name || user.email,
      updated_at: now,
    };

    // Quando OS esta 'completed', tambem transiciona para 'invoiced'
    let didStatusTransition = false;
    if (order.status === "completed") {
      updatePayload.status = "invoiced";
      didStatusTransition = true;
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from("service_orders")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error(`Failed to approve order ${id}: ${updateError.message}`);
      throw new Error("Failed to approve service order");
    }

    if (didStatusTransition) {
      const { error: historyError } = await supabase
        .from("os_status_history")
        .insert({
          service_order_id: id,
          from_status: "completed",
          to_status: "invoiced",
          changed_by: user.id,
          notes: "Ordem de servico aprovada",
        });

      if (historyError) {
        console.warn(
          `Failed to create status history for order ${id}: ${historyError.message}`
        );
      }
    }

    logAudit({
      userId: user.id,
      action: "service_order.approved",
      entityType: "service_order",
      entityId: id,
      oldData: order as Record<string, unknown>,
      newData: updatedOrder as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(updatedOrder);
  } catch (error) {
    return errorResponse(error);
  }
}
