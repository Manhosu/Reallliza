import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

interface TemplateItemRow {
  id: string;
  step_key: string;
  name: string;
  description: string | null;
  order_index: number;
  photos_required_min: number;
  final_photos_required_min: number;
  occurrence_enabled: boolean;
  is_required: boolean;
}

/**
 * Cria os_step_executions para a OS com base no template informado.
 * Reutilizado pelo POST aqui e pelo trigger automático em status_change.
 */
export async function provisionSteps(
  supabase: SupabaseClient,
  serviceOrderId: string,
  templateGroupId: string
): Promise<{ created: number }> {
  // Verifica se já existem execuções iniciadas
  const { data: started } = await supabase
    .from("os_step_executions")
    .select("id, status")
    .eq("service_order_id", serviceOrderId)
    .in("status", ["in_progress", "completed"]);

  if (started && started.length > 0) {
    throw new AuthError(
      409,
      "OS já em execução. Não é permitido trocar o template depois que alguma etapa foi iniciada."
    );
  }

  // Limpa execuções pending pré-existentes (caso troca de template antes de iniciar)
  await supabase
    .from("os_step_executions")
    .delete()
    .eq("service_order_id", serviceOrderId)
    .eq("status", "pending");

  const { data: items, error: itemsErr } = await supabase
    .from("step_template_items")
    .select("*")
    .eq("group_id", templateGroupId)
    .order("order_index", { ascending: true });

  if (itemsErr) throw new Error("Falha ao buscar etapas do template");

  const itemList = (items || []) as TemplateItemRow[];
  if (itemList.length === 0) {
    return { created: 0 };
  }

  const rows = itemList.map((it) => ({
    service_order_id: serviceOrderId,
    template_id: null,
    template_item_id: it.id,
    step_key: it.step_key,
    order_index: it.order_index,
    status: "pending" as const,
    photos_count: 0,
    metadata: {
      // Snapshot dos dados do template no momento do provisionamento — protege
      // contra alterações futuras no template (UX consistente com o que o técnico viu).
      name: it.name,
      description: it.description,
      photos_required_min: it.photos_required_min,
      final_photos_required_min: it.final_photos_required_min,
      occurrence_enabled: it.occurrence_enabled,
      is_required: it.is_required,
    },
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("os_step_executions")
    .insert(rows)
    .select("id");

  if (insErr) {
    console.error(`Failed to provision steps: ${insErr.message}`);
    throw new Error("Falha ao provisionar etapas");
  }

  return { created: inserted?.length || 0 };
}

/**
 * POST /api/service-orders/[id]/provision-steps
 * Body: { step_template_group_id?: string }
 * Se omitido, usa o que estiver salvo em service_orders.step_template_group_id.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const supabase = getAdminClient();

    const { data: order, error: orderErr } = await supabase
      .from("service_orders")
      .select("id, step_template_group_id")
      .eq("id", id)
      .single();

    if (orderErr || !order) {
      throw new AuthError(404, "OS não encontrada");
    }

    const groupId = body.step_template_group_id || order.step_template_group_id;
    if (!groupId) {
      throw new AuthError(400, "Nenhum template de execução vinculado à OS");
    }

    if (groupId !== order.step_template_group_id) {
      await supabase
        .from("service_orders")
        .update({ step_template_group_id: groupId })
        .eq("id", id);
    }

    const result = await provisionSteps(supabase, id, groupId);

    logAudit({
      userId: user.id,
      action: "service_order.steps_provisioned",
      entityType: "service_order",
      entityId: id,
      newData: {
        step_template_group_id: groupId,
        steps_created: result.created,
      },
    });

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
