import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

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
    if (!["admin", "supervisor", "gestor"].includes(role || "")) {
      throw new AuthError(403, "Apenas admin/supervisor/gestor pode decidir");
    }

    const { data: current, error: fetchError } = await supabase
      .from("tool_requests")
      .select("id, status, requester_id, tool_name, quantity, priority, tool_id")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      throw new AuthError(404, "Solicitacao nao encontrada");
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
    let update: Record<string, unknown> = {};
    if (body.action === "approve") {
      update = { status: "approved", approved_by: user.id, approved_at: nowIso };
    } else if (body.action === "separate") {
      update = { status: "separating" };
    } else if (body.action === "ready") {
      update = { status: "awaiting_pickup" };
    } else if (body.action === "deliver") {
      // Cria custody + move pra delivered
      if (!body.tool_id && !current.tool_id) {
        throw new AuthError(400, "tool_id obrigatorio no deliver");
      }
      const toolId = body.tool_id || (current.tool_id as string);
      // Jessica 28/07: aceita photos_out + condition_out + notes_out do payload
      const b = body as {
        tool_id?: string;
        condition_out?: string;
        notes_out?: string;
        photos_out?: Array<{ url: string; name: string; storage_path?: string }>;
      };
      const { data: cust, error: cErr } = await supabase
        .from("tool_custody")
        .insert({
          tool_id: toolId,
          user_id: current.requester_id,
          checked_out_at: nowIso,
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
      await supabase
        .from("tool_inventory")
        .update({ status: "in_custody" })
        .eq("id", toolId);
      update = {
        status: "delivered",
        released_by: user.id,
        released_at: nowIso,
        custody_id: (cust as { id: string }).id,
      };
    } else if (body.action === "reject") {
      update = {
        status: "rejected",
        rejected_by: user.id,
        rejected_at: nowIso,
        rejection_reason: body.rejection_reason?.trim() || null,
      };
    } else if (body.action === "cancel") {
      update = { status: "cancelled" };
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
    if (notif && current.requester_id) {
      try {
        const { createNotification } = await import(
          "@/lib/api-helpers/notifications"
        );
        await createNotification(
          current.requester_id as string,
          notif.title,
          notif.body,
          "general",
          { tool_request_id: id, status: (update as { status?: string }).status },
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
