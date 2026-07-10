import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { redactItemsForRole } from "@/lib/api-helpers/redact";

/**
 * GET /api/service-orders/[id]/items
 * Lista itens (produtos/servicos) da OS, ordenados por position.
 * Admin/manager veem todas; tecnico ve apenas itens de OS que esta atribuida a ele.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    // Garante que a OS existe e o usuario tem permissao para ler
    const { data: order, error: orderErr } = await supabase
      .from("service_orders")
      .select("id, technician_id, partner_id")
      .eq("id", id)
      .single();

    if (orderErr || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    if (user.role === "technician" && order.technician_id !== user.id) {
      throw new AuthError(403, "You do not have permission to view items for this service order");
    }

    if (user.role === "partner") {
      const { data: partnerData } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!partnerData || order.partner_id !== partnerData.id) {
        throw new AuthError(403, "You do not have permission to view items for this service order");
      }
    }

    const { data: items, error } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("service_order_id", id)
      .order("position", { ascending: true });

    if (error) {
      console.error(`Failed to fetch items: ${error.message}`);
      throw new Error("Failed to fetch service order items");
    }

    // Loja nao ve valores (Jessica 10/07)
    const redacted = redactItemsForRole(
      (items ?? []) as Record<string, unknown>[],
      user.role
    );

    return jsonResponse(redacted);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/service-orders/[id]/items
 * Cria um item na OS. Apenas admin pode criar.
 * Body: { kind: 'S'|'P', identification?, description, unit?, unit_value?, quantity?, position? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();

    if (!body.description) {
      throw new AuthError(400, "description is required");
    }

    if (body.kind && !["S", "P"].includes(body.kind)) {
      throw new AuthError(400, "kind must be 'S' (servico) or 'P' (produto)");
    }

    const supabase = getAdminClient();

    // Verifica existencia da OS
    const { data: order, error: orderErr } = await supabase
      .from("service_orders")
      .select("id")
      .eq("id", id)
      .single();

    if (orderErr || !order) {
      throw new AuthError(404, `Service order with ID ${id} not found`);
    }

    const insertData: Record<string, unknown> = {
      service_order_id: id,
      kind: body.kind || "S",
      description: body.description,
      unit_value: Number(body.unit_value ?? 0),
      quantity: Number(body.quantity ?? 1),
      position: Number(body.position ?? 0),
    };
    if (body.identification != null) insertData.identification = body.identification;
    if (body.unit != null) insertData.unit = body.unit;

    const { data: item, error } = await supabase
      .from("service_order_items")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      console.error(`Failed to create item: ${error.message}`);
      throw new Error("Failed to create service order item");
    }

    logAudit({
      userId: user.id,
      action: "service_order_item.created",
      entityType: "service_order_item",
      entityId: item.id,
      newData: item as Record<string, unknown>,
    });

    return jsonResponse(item, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
