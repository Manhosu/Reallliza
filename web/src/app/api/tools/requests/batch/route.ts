import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { getAvailabilityByTool } from "@/lib/tools/availability";

type RequestPriority = "low" | "medium" | "high" | "urgent";

interface BatchItem {
  tool_id: string;
  quantity: number;
  justification?: string | null;
  priority?: RequestPriority;
  /** OS pra qual a ferramenta foi pedida (opcional, por item). */
  service_order_id?: string | null;
}

interface BatchPayload {
  items: BatchItem[];
  shared_justification?: string | null;
  priority?: RequestPriority;
  /** OS aplicada a todos os itens do carrinho, quando o item não traz a sua. */
  service_order_id?: string | null;
}

/**
 * POST /api/tools/requests/batch
 * Cria varias solicitacoes de ferramenta de uma vez (carrinho).
 * Body: { items: [{tool_id, quantity, justification?}], shared_justification? }
 * Acessivel para qualquer usuario autenticado (technician/partner/admin).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = (await request.json()) as Partial<BatchPayload>;

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      throw new AuthError(400, "items is required and must be a non-empty array");
    }

    const sharedJustification = body.shared_justification?.toString().trim() || null;
    const validPriorities: RequestPriority[] = ["low", "medium", "high", "urgent"];
    const sharedPriority: RequestPriority =
      body.priority && validPriorities.includes(body.priority)
        ? body.priority
        : "medium";
    const supabase = getAdminClient();

    // Validate tools exist and snapshot names
    const toolIds = items.map((it) => it.tool_id).filter(Boolean);
    if (toolIds.length !== items.length) {
      throw new AuthError(400, "Each item must include tool_id");
    }

    const { data: tools, error: toolsError } = await supabase
      .from("tool_inventory")
      .select("id, name")
      .in("id", toolIds);

    if (toolsError) {
      console.error(`Failed to fetch tools: ${toolsError.message}`);
      throw new Error("Failed to validate tools");
    }

    const toolMap = new Map<string, { id: string; name: string }>(
      (tools || []).map((t) => [t.id, t])
    );

    const missing = toolIds.filter((id) => !toolMap.has(id));
    if (missing.length > 0) {
      throw new AuthError(400, `Ferramentas nao encontradas: ${missing.join(", ")}`);
    }

    // Jessica 12/08: "o Iago solicitou 3 parafusadeiras, porém no estoque
    // havia apenas 1 disponível. O sistema não deve permitir."
    //
    // O servidor é a autoridade: o app pode estar com o catálogo velho, e dois
    // técnicos podem pedir a última unidade ao mesmo tempo. Além do estoque
    // livre, descontamos o que já está pedido e ainda não foi resolvido —
    // senão a mesma unidade é prometida duas vezes.
    const availability = await getAvailabilityByTool(supabase, toolIds);

    const { data: emAberto } = await supabase
      .from("tool_requests")
      .select("tool_id, quantity")
      .in("tool_id", toolIds)
      .in("status", ["pending", "approved", "separating", "awaiting_pickup"]);

    const reservadoEmPedidos = new Map<string, number>();
    for (const r of (emAberto ?? []) as Array<{ tool_id: string; quantity: number }>) {
      reservadoEmPedidos.set(
        r.tool_id,
        (reservadoEmPedidos.get(r.tool_id) ?? 0) + (Number(r.quantity) || 0)
      );
    }

    const rows = items.map((it) => {
      const qty = Number(it.quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        throw new AuthError(400, "quantity invalida em um dos itens");
      }
      const tool = toolMap.get(it.tool_id)!;

      const disponivel = availability.get(it.tool_id)?.available_quantity ?? 0;
      const jaPedido = reservadoEmPedidos.get(it.tool_id) ?? 0;
      const livre = Math.max(0, disponivel - jaPedido);

      if (qty > livre) {
        throw new AuthError(
          400,
          livre === 0
            ? `${tool.name}: não há unidades disponíveis no momento.`
            : `${tool.name}: você pediu ${Math.floor(qty)}, mas há apenas ${livre} disponível(is).`
        );
      }
      const justification =
        (it.justification && it.justification.toString().trim()) ||
        sharedJustification ||
        null;
      const itemPriority: RequestPriority =
        it.priority && validPriorities.includes(it.priority)
          ? it.priority
          : sharedPriority;
      // Jessica 10/08: OS opcional no pedido — propagada pra custodia na
      // entrega, e' o que alimenta o historico "qual OS usou a ferramenta".
      const serviceOrderId = it.service_order_id || body.service_order_id || null;
      return {
        requester_id: user.id,
        tool_id: tool.id,
        tool_name: tool.name,
        quantity: Math.floor(qty),
        justification,
        priority: itemPriority,
        service_order_id: serviceOrderId,
        status: "pending",
      };
    });

    const { data: created, error: insertError } = await supabase
      .from("tool_requests")
      .insert(rows)
      .select();

    if (insertError) {
      console.error(`Failed to insert tool_requests: ${insertError.message}`);
      throw new Error(`Failed to create requests: ${insertError.message}`);
    }

    // Audit
    logAudit({
      userId: user.id,
      action: "create_batch",
      entityType: "tool_requests",
      entityId: created?.[0]?.id ?? "batch",
      newData: { count: created?.length ?? 0, items: created } as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse({ created: created?.length ?? 0, requests: created ?? [] }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
