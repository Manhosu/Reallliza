import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { recordToolEvent, setUnitStatus } from "@/lib/tools/events";

/**
 * PATCH /api/tools/requests/[id]
 * Aprova/rejeita ou avança pelo fluxo do operador (Jessica 28/07):
 *   pending -> separating -> awaiting_pickup -> delivered
 * ou pending -> rejected (recusada) ou cancelled.
 *
 * Body: { action: 'approve' | 'reject' | 'separate' | 'ready' | 'deliver' | 'cancel',
 *         rejection_reason?, tool_id? (obrigatorio no deliver) }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const body = (await request.json()) as {
      action?: string;
      rejection_reason?: string;
      tool_id?: string;
    };

    const VALID_ACTIONS = [
      "approve",
      "reject",
      "separate",
      "ready",
      "deliver",
      "cancel",
    ];
    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      throw new AuthError(
        400,
        `action must be one of: ${VALID_ACTIONS.join(", ")}`
      );
    }

    const supabase = getAdminClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role as string | undefined;
    const isOperator = ["admin", "supervisor", "gestor"].includes(role || "");

    const { data: current, error: fetchError } = await supabase
      .from("tool_requests")
      .select(
        "id, status, requester_id, tool_name, quantity, priority, tool_id, service_order_id, unit_id, expected_return_at"
      )
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      throw new AuthError(404, "Solicitacao nao encontrada");
    }

    // O técnico pode cancelar o PRÓPRIO pedido enquanto ele não saiu da
    // análise — é o que a RLS da migration 013 já permitia, mas a rota barrava
    // com 403. Todas as outras ações continuam restritas ao operador.
    const isOwnPendingCancel =
      body.action === "cancel" &&
      current.requester_id === user.id &&
      current.status === "pending";

    if (!isOperator && !isOwnPendingCancel) {
      throw new AuthError(
        403,
        "Apenas admin/supervisor/gestor pode decidir. O solicitante pode cancelar o próprio pedido em análise."
      );
    }

    // State machine simples
    const ALLOWED: Record<string, string[]> = {
      pending: ["approve", "separate", "reject", "cancel"],
      approved: ["separate", "reject", "cancel"],
      separating: ["ready", "cancel"],
      awaiting_pickup: ["deliver", "cancel"],
      delivered: [],
      released: [],
      rejected: [],
      cancelled: [],
    };
    const allowed = ALLOWED[current.status] || [];
    if (!allowed.includes(body.action)) {
      throw new AuthError(
        400,
        `Acao '${body.action}' nao permitida em status '${current.status}'.`
      );
    }

    const nowIso = new Date().toISOString();
    const b = body as {
      tool_id?: string;
      unit_id?: string;
      condition_out?: string;
      notes_out?: string;
      photos_out?: Array<{ url: string; name: string; storage_path?: string }>;
      service_order_id?: string;
      expected_return_at?: string;
      almoxarife_notes?: string;
      rejection_reason?: string;
    };

    const requestToolId =
      b.tool_id || (current.tool_id as string | null) || null;

    /** Modo de controle do tipo pedido — decide se rastreamos unidade ou saldo. */
    let trackingMode: string = "quantity";
    if (requestToolId) {
      const { data: toolRow } = await supabase
        .from("tool_inventory")
        .select("tracking_mode")
        .eq("id", requestToolId)
        .maybeSingle();
      trackingMode = (toolRow as { tracking_mode?: string })?.tracking_mode ?? "quantity";
    }

    let update: Record<string, unknown> = {};
    let reservedUnitId: string | null =
      (current as { unit_id?: string | null }).unit_id ?? null;

    if (body.action === "approve") {
      // Seção 12: ao aprovar, o almoxarifado escolhe a unidade física, ela
      // fica reservada e não pode ir para outro pedido.
      if (trackingMode === "controlled") {
        if (!b.unit_id) {
          throw new AuthError(
            400,
            "Selecione a unidade física que será destinada a este pedido"
          );
        }
        const { data: unit } = await supabase
          .from("tool_units")
          .select("id, tool_id, code, status, reserved_for_request_id")
          .eq("id", b.unit_id)
          .maybeSingle();

        if (!unit) throw new AuthError(400, "Unidade não encontrada");
        if (unit.tool_id !== requestToolId) {
          throw new AuthError(400, "A unidade escolhida não é do tipo solicitado");
        }
        if (unit.status !== "available") {
          throw new AuthError(
            400,
            `A unidade ${unit.code} não está disponível (situação: ${unit.status})`
          );
        }
        if (
          unit.reserved_for_request_id &&
          unit.reserved_for_request_id !== id
        ) {
          throw new AuthError(400, `A unidade ${unit.code} já está reservada para outro pedido`);
        }

        await setUnitStatus(supabase, unit.id, "reserved", {
          event_type: "reserva",
          description: `Unidade ${unit.code} reservada para o pedido`,
          technician_id: current.requester_id as string,
          almoxarife_id: user.id,
          actor_id: user.id,
          request_id: id,
        });
        await supabase
          .from("tool_units")
          .update({ reserved_for_request_id: id })
          .eq("id", unit.id);

        reservedUnitId = unit.id;
      }

      update = {
        status: "approved",
        approved_by: user.id,
        approved_at: nowIso,
        unit_id: reservedUnitId,
        almoxarife_notes: b.almoxarife_notes ?? null,
      };
    } else if (body.action === "separate") {
      update = { status: "separating" };
    } else if (body.action === "ready") {
      update = { status: "awaiting_pickup" };
    } else if (body.action === "deliver") {
      if (!requestToolId) {
        throw new AuthError(400, "tool_id obrigatorio no deliver");
      }
      const toolId = requestToolId;
      const unitId = b.unit_id || reservedUnitId;

      if (trackingMode === "controlled" && !unitId) {
        throw new AuthError(400, "Informe a unidade física entregue");
      }

      // Jessica 10/08: propaga a OS do pedido pra custodia. Sem isso o
      // historico da ferramenta nunca sabia em qual OS ela foi usada.
      const serviceOrderId =
        b.service_order_id ||
        ((current as { service_order_id?: string | null }).service_order_id ?? null);

      // Prazo: sem ele "vence hoje", "atrasada" e "próxima devolução" não têm
      // de onde sair — eram sempre zero antes.
      const expectedReturn =
        b.expected_return_at ||
        (current as { expected_return_at?: string | null }).expected_return_at ||
        null;

      const { data: cust, error: cErr } = await supabase
        .from("tool_custody")
        .insert({
          tool_id: toolId,
          unit_id: unitId ?? null,
          user_id: current.requester_id,
          service_order_id: serviceOrderId,
          checked_out_at: nowIso,
          expected_return_at: expectedReturn,
          condition_out: b.condition_out || "good",
          notes_out: b.notes_out || null,
          photos_out: Array.isArray(b.photos_out) ? b.photos_out : [],
          delivered_by: user.id,
        })
        .select("id")
        .single();
      if (cErr || !cust) {
        throw new Error(`Falha criar custody: ${cErr?.message}`);
      }

      if (trackingMode === "controlled" && unitId) {
        await setUnitStatus(supabase, unitId, "in_custody", {
          tool_id: toolId,
          event_type: "entrega",
          description: "Entrega física confirmada ao técnico",
          technician_id: current.requester_id as string,
          almoxarife_id: user.id,
          actor_id: user.id,
          request_id: id,
          custody_id: (cust as { id: string }).id,
          service_order_id: serviceOrderId,
          condition: b.condition_out || "good",
          notes: b.notes_out || null,
          photos: Array.isArray(b.photos_out) ? b.photos_out : [],
        });
        await supabase
          .from("tool_units")
          .update({ reserved_for_request_id: null })
          .eq("id", unitId);
      } else {
        // Modo quantidade: abate o saldo em vez de marcar o tipo inteiro como
        // em custódia — era esse o bug que sumia o tipo do catálogo do app.
        const { data: toolRow } = await supabase
          .from("tool_inventory")
          .select("quantity_available")
          .eq("id", toolId)
          .maybeSingle();
        const saldo = Number(
          (toolRow as { quantity_available?: number })?.quantity_available ?? 0
        );
        const baixa = Math.max(1, Number(current.quantity) || 1);
        await supabase
          .from("tool_inventory")
          .update({ quantity_available: Math.max(0, saldo - baixa) })
          .eq("id", toolId);

        await recordToolEvent(supabase, {
          tool_id: toolId,
          event_type: "entrega",
          description: `Entrega de ${baixa} unidade(s) ao técnico`,
          technician_id: current.requester_id as string,
          almoxarife_id: user.id,
          actor_id: user.id,
          request_id: id,
          custody_id: (cust as { id: string }).id,
          service_order_id: serviceOrderId,
          condition: b.condition_out || "good",
          notes: b.notes_out || null,
          photos: Array.isArray(b.photos_out) ? b.photos_out : [],
          metadata: { quantity: baixa, balance_after: Math.max(0, saldo - baixa) },
        });
      }

      update = {
        status: "delivered",
        released_by: user.id,
        released_at: nowIso,
        custody_id: (cust as { id: string }).id,
        unit_id: unitId ?? null,
      };
    } else if (body.action === "reject") {
      update = {
        status: "rejected",
        rejected_by: user.id,
        rejected_at: nowIso,
        rejection_reason: b.rejection_reason?.trim() || null,
      };
    } else if (body.action === "cancel") {
      update = { status: "cancelled" };
    }

    // Recusa e cancelamento soltam a unidade que estava reservada.
    if (
      (body.action === "reject" || body.action === "cancel") &&
      reservedUnitId
    ) {
      await setUnitStatus(supabase, reservedUnitId, "available", {
        event_type: body.action === "reject" ? "pedido_recusado" : "pedido_cancelado",
        description: "Reserva liberada",
        almoxarife_id: user.id,
        actor_id: user.id,
        request_id: id,
      });
      await supabase
        .from("tool_units")
        .update({ reserved_for_request_id: null })
        .eq("id", reservedUnitId);
      update.unit_id = null;
    }

    const { data: updated, error: updateError } = await supabase
      .from("tool_requests")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update: ${updateError.message}`);
    }

    // Separação e "pronta para retirada" também entram no histórico da
    // ferramenta (spec seção 24, bloco "Pedidos e reservas"). Entrega, reserva
    // e recusa já registram dentro dos seus próprios blocos.
    if ((body.action === "separate" || body.action === "ready") && requestToolId) {
      await recordToolEvent(supabase, {
        tool_id: requestToolId,
        unit_id: reservedUnitId,
        event_type: body.action === "separate" ? "separacao" : "pronta_retirada",
        description:
          body.action === "separate"
            ? "Unidade em separação no almoxarifado"
            : "Unidade pronta para retirada",
        status_from: current.status as string,
        status_to: (update as { status?: string }).status ?? null,
        technician_id: current.requester_id as string,
        almoxarife_id: user.id,
        actor_id: user.id,
        request_id: id,
      });
    }

    logAudit({
      userId: user.id,
      action: body.action,
      entityType: "tool_request",
      entityId: id,
      oldData: { status: current.status } as Record<string, unknown>,
      newData: update as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    // Jessica 04/08: notifica tecnico em cada transicao de status.
    const NOTIF_MSG: Record<string, { title: string; body: string }> = {
      separate: {
        title: "Ferramenta em separação",
        body: `O almoxarifado começou a separar sua solicitação: ${current.tool_name}.`,
      },
      ready: {
        title: "Ferramenta pronta pra retirada",
        body: `Sua solicitação foi separada: ${current.tool_name}. Pode passar no almoxarifado.`,
      },
      deliver: {
        title: "Ferramenta entregue",
        body: `${current.tool_name} agora está na sua custódia.`,
      },
      reject: {
        title: "Solicitação recusada",
        body: `${current.tool_name}: ${body.rejection_reason ?? "sem motivo informado"}.`,
      },
      cancel: {
        title: "Solicitação cancelada",
        body: `Sua solicitação de ${current.tool_name} foi cancelada.`,
      },
    };
    const notif = NOTIF_MSG[body.action];
    // Não notifica quem fez a própria ação (técnico cancelando o próprio pedido).
    if (notif && current.requester_id && current.requester_id !== user.id) {
      try {
        const { createNotification } = await import(
          "@/lib/api-helpers/notifications"
        );
        await createNotification(
          current.requester_id as string,
          notif.title,
          notif.body,
          "general",
          // `type` é o que o listener do app lê pra decidir a navegação
          // (push-notifications.ts). Sem essa chave, tocar na notificação não
          // abria nada — o switch caía fora antes de qualquer case.
          {
            type: "tool_custody",
            tool_request_id: id,
            status: (update as { status?: string }).status,
          },
          { priority: body.action === "ready" ? "high" : "normal" }
        );
      } catch (err) {
        console.warn(
          `Notif tool_request failed: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    return jsonResponse({ request: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
