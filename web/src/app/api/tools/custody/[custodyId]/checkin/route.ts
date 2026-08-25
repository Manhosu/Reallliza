import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { recordToolEvent, setUnitStatus } from "@/lib/tools/events";

/**
 * POST /api/tools/custody/[custodyId]/checkin
 * Return a tool (check in from custody).
 * Updates the tool_custody record with returned_at timestamp,
 * and sets tool status back to 'available' (or 'maintenance' if condition is poor/damaged).
 * Admin and manager roles only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ custodyId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "almoxarifado"]);
    const { custodyId } = await params;

    const body = await request.json();
    const { condition_in, notes_in, photos_in, new_status } = body as {
      condition_in?: string;
      notes_in?: string;
      photos_in?: Array<{ url: string; name: string; storage_path?: string }>;
      new_status?: string; // Jessica 28/07: operador escolhe o destino da ferramenta
    };

    if (!condition_in) {
      return jsonResponse(
        {
          message:
            "condition_in is required (good, fair, poor, damaged)",
        },
        400
      );
    }

    const supabase = getAdminClient();

    // Get the custody record
    const { data: custody, error: findError } = await supabase
      .from("tool_custody")
      .select(
        "id, tool_id, unit_id, user_id, checked_in_at, checked_out_at, expected_return_at, service_order_id"
      )
      .eq("id", custodyId)
      .single();

    if (findError || !custody) {
      return jsonResponse(
        { message: `Custody record with ID ${custodyId} not found` },
        404
      );
    }

    if (custody.checked_in_at) {
      return jsonResponse(
        { message: "This tool has already been checked in" },
        400
      );
    }

    // Update custody record with check-in info
    const { data: updatedCustody, error: updateCustodyError } = await supabase
      .from("tool_custody")
      .update({
        checked_in_at: new Date().toISOString(),
        condition_in,
        notes_in: notes_in || null,
        photos_in: Array.isArray(photos_in) ? photos_in : [],
        received_by: user.id,
      })
      .eq("id", custodyId)
      .select()
      .single();

    if (updateCustodyError) {
      console.error(
        `Failed to update custody record: ${updateCustodyError.message}`
      );
      throw new Error("Failed to update custody record");
    }

    // Jessica 28/07: se operador escolheu status explicito, respeita.
    // Senao, aplica regra: poor/damaged -> maintenance, resto -> available.
    const VALID_STATUSES = [
      "available",
      "maintenance",
      "retired",
      "damaged",
      "awaiting_evaluation",
      "missing",
    ];
    const newStatus =
      new_status && VALID_STATUSES.includes(new_status)
        ? new_status
        : condition_in === "poor" || condition_in === "damaged"
          ? "maintenance"
          : "available";

    // Destino da unidade / do saldo.
    //
    // Spec seção 20: a unidade só volta a ficar "Disponível" depois da
    // conferência e liberação. Em modo controlado quem muda de estado é a
    // UNIDADE — antes o código marcava o tipo inteiro, o que tirava todas as
    // outras unidades do catálogo de uma vez.
    const { data: toolRow } = await supabase
      .from("tool_inventory")
      .select("tracking_mode, quantity_available")
      .eq("id", custody.tool_id)
      .maybeSingle();
    const trackingMode =
      (toolRow as { tracking_mode?: string })?.tracking_mode ?? "quantity";

    if (trackingMode === "controlled" && custody.unit_id) {
      await setUnitStatus(supabase, custody.unit_id as string, newStatus, {
        tool_id: custody.tool_id as string,
        event_type: "recebimento",
        description: "Devolução recebida e conferida pelo almoxarifado",
        technician_id: custody.user_id as string,
        almoxarife_id: user.id,
        actor_id: user.id,
        custody_id: custodyId,
        service_order_id: custody.service_order_id as string | null,
        condition: condition_in,
        notes: notes_in || null,
        photos: Array.isArray(photos_in) ? photos_in : [],
      });
      await supabase
        .from("tool_units")
        .update({ condition: condition_in })
        .eq("id", custody.unit_id);
    } else {
      // Modo quantidade: devolve o saldo à prateleira.
      const saldo = Number(
        (toolRow as { quantity_available?: number })?.quantity_available ?? 0
      );
      await supabase
        .from("tool_inventory")
        .update({
          quantity_available: saldo + 1,
          condition: condition_in,
          updated_at: new Date().toISOString(),
        })
        .eq("id", custody.tool_id);

      await recordToolEvent(supabase, {
        tool_id: custody.tool_id as string,
        event_type: "recebimento",
        description: "Devolução recebida e conferida pelo almoxarifado",
        technician_id: custody.user_id as string,
        almoxarife_id: user.id,
        actor_id: user.id,
        custody_id: custodyId,
        service_order_id: custody.service_order_id as string | null,
        condition: condition_in,
        notes: notes_in || null,
        photos: Array.isArray(photos_in) ? photos_in : [],
        metadata: { balance_after: saldo + 1 },
      });
    }

    // Encerramento da custódia (seção 20), com o registro de atraso.
    const wasLate =
      !!custody.expected_return_at &&
      new Date(custody.expected_return_at as string).getTime() < Date.now();
    await recordToolEvent(supabase, {
      tool_id: custody.tool_id as string,
      unit_id: custody.unit_id as string | null,
      event_type: "encerramento",
      description: wasLate
        ? "Custódia encerrada com atraso"
        : "Custódia encerrada",
      technician_id: custody.user_id as string,
      almoxarife_id: user.id,
      actor_id: user.id,
      custody_id: custodyId,
      service_order_id: custody.service_order_id as string | null,
      metadata: {
        late: wasLate,
        expected_return_at: custody.expected_return_at,
        checked_out_at: custody.checked_out_at,
      },
    });

    // Prorrogações pendentes dessa custódia perdem o sentido.
    await supabase
      .from("tool_extension_requests")
      .update({ status: "cancelled" })
      .eq("custody_id", custodyId)
      .eq("status", "pending");

    // Avisa o técnico (spec seção 28).
    try {
      const { createNotification } = await import("@/lib/api-helpers/notifications");
      await createNotification(
        custody.user_id as string,
        "Devolução confirmada",
        "O almoxarifado recebeu e conferiu a ferramenta devolvida.",
        "general",
        { type: "tool_custody", custody_id: custodyId, kind: "return_confirmed" },
        { priority: "normal" }
      );
    } catch (err) {
      console.warn(
        `Notif devolucao confirmada falhou: ${err instanceof Error ? err.message : err}`
      );
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "checkin",
      entityType: "tool_custody",
      entityId: custodyId,
      newData: updatedCustody as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(updatedCustody);
  } catch (error) {
    return errorResponse(error);
  }
}
