import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const EDITABLE_FIELDS = [
  "payment_type",
  "number_label",
  "doc_number",
  "due_date",
  "value",
  "paid_at",
  "position",
];

/**
 * PATCH /api/service-orders/[id]/payments/[paymentId]
 * Edita uma parcela. Apenas admin.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id, paymentId } = await params;
    const body = await request.json();

    const supabase = getAdminClient();

    const { data: existing, error: findErr } = await supabase
      .from("service_order_payments")
      .select("*")
      .eq("id", paymentId)
      .eq("service_order_id", id)
      .single();

    if (findErr || !existing) {
      throw new AuthError(404, "Payment not found");
    }

    const updatePayload: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        updatePayload[field] = body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new AuthError(400, "No valid fields to update");
    }

    const { data: payment, error } = await supabase
      .from("service_order_payments")
      .update(updatePayload)
      .eq("id", paymentId)
      .eq("service_order_id", id)
      .select("*")
      .single();

    if (error) {
      console.error(`Failed to update payment: ${error.message}`);
      throw new Error("Failed to update service order payment");
    }

    logAudit({
      userId: user.id,
      action: "service_order_payment.updated",
      entityType: "service_order_payment",
      entityId: paymentId,
      oldData: existing as Record<string, unknown>,
      newData: payment as Record<string, unknown>,
    });

    return jsonResponse(payment);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/service-orders/[id]/payments/[paymentId]
 * Remove uma parcela. Apenas admin.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id, paymentId } = await params;

    const supabase = getAdminClient();

    const { data: existing, error: findErr } = await supabase
      .from("service_order_payments")
      .select("*")
      .eq("id", paymentId)
      .eq("service_order_id", id)
      .single();

    if (findErr || !existing) {
      throw new AuthError(404, "Payment not found");
    }

    const { error } = await supabase
      .from("service_order_payments")
      .delete()
      .eq("id", paymentId)
      .eq("service_order_id", id);

    if (error) {
      console.error(`Failed to delete payment: ${error.message}`);
      throw new Error("Failed to delete service order payment");
    }

    logAudit({
      userId: user.id,
      action: "service_order_payment.deleted",
      entityType: "service_order_payment",
      entityId: paymentId,
      oldData: existing as Record<string, unknown>,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
