import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/service-orders/[id]/payments
 * Lista parcelas da OS, ordenadas por position. Apenas admin.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;

    const supabase = getAdminClient();

    const { data: payments, error } = await supabase
      .from("service_order_payments")
      .select("*")
      .eq("service_order_id", id)
      .order("position", { ascending: true });

    if (error) {
      console.error(`Failed to fetch payments: ${error.message}`);
      throw new Error("Failed to fetch service order payments");
    }

    return jsonResponse(payments || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/service-orders/[id]/payments
 * Cria uma parcela. Apenas admin.
 * Body: { payment_type?, number_label?, doc_number?, due_date?, value?, paid_at?, position? }
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

    const supabase = getAdminClient();

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
      position: Number(body.position ?? 0),
      value: Number(body.value ?? 0),
    };

    if (body.payment_type != null) insertData.payment_type = body.payment_type;
    if (body.number_label != null) insertData.number_label = body.number_label;
    if (body.doc_number != null) insertData.doc_number = body.doc_number;
    if (body.due_date) insertData.due_date = body.due_date;
    if (body.paid_at) insertData.paid_at = body.paid_at;

    const { data: payment, error } = await supabase
      .from("service_order_payments")
      .insert(insertData)
      .select("*")
      .single();

    if (error) {
      console.error(`Failed to create payment: ${error.message}`);
      throw new Error("Failed to create service order payment");
    }

    logAudit({
      userId: user.id,
      action: "service_order_payment.created",
      entityType: "service_order_payment",
      entityId: payment.id,
      newData: payment as Record<string, unknown>,
    });

    return jsonResponse(payment, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
