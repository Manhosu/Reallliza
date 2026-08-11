import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { recordToolEvent } from "@/lib/tools/events";

/**
 * Prorrogação de prazo de custódia (spec seção 17).
 *
 * POST  — técnico solicita nova data
 * PATCH — almoxarifado aprova, recusa ou define outra data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ custodyId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { custodyId } = await params;
    const body = await request.json();

    if (!body?.requested_return_at) {
      throw new AuthError(400, "Informe a nova data de devolução");
    }

    const supabase = getAdminClient();

    const { data: custody } = await supabase
      .from("tool_custody")
      .select("id, user_id, tool_id, unit_id, checked_in_at, expected_return_at, service_order_id")
      .eq("id", custodyId)
      .maybeSingle();

    if (!custody) throw new AuthError(404, "Custódia não encontrada");
    if (custody.checked_in_at) throw new AuthError(400, "Esta custódia já foi encerrada");
    if (custody.user_id !== user.id) {
      throw new AuthError(403, "Só o responsável pela custódia pode pedir prorrogação");
    }

    // Uma pendente por vez evita fila duplicada pro operador.
    const { data: existing } = await supabase
      .from("tool_extension_requests")
      .select("id")
      .eq("custody_id", custodyId)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      throw new AuthError(409, "Já existe uma prorrogação aguardando análise para esta custódia");
    }

    const { data, error } = await supabase
      .from("tool_extension_requests")
      .insert({
        custody_id: custodyId,
        requested_by: user.id,
        current_return_at: custody.expected_return_at,
        requested_return_at: body.requested_return_at,
        justification: body.justification || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await recordToolEvent(supabase, {
      tool_id: custody.tool_id,
      unit_id: custody.unit_id,
      custody_id: custodyId,
      event_type: "prorrogacao_solicitada",
      description: "Prorrogação solicitada pelo técnico",
      technician_id: user.id,
      actor_id: user.id,
      service_order_id: custody.service_order_id,
      notes: body.justification || null,
      metadata: {
        current_return_at: custody.expected_return_at,
        requested_return_at: body.requested_return_at,
      },
    });

    try {
      const { createNotification } = await import("@/lib/api-helpers/notifications");
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("status", "active");
      await Promise.allSettled(
        ((admins ?? []) as Array<{ id: string }>).map((a) =>
          createNotification(
            a.id,
            "Prorrogação solicitada",
            "Um técnico pediu mais prazo para devolver uma ferramenta.",
            "general",
            { custody_id: custodyId, kind: "extension_requested" },
            { priority: "normal" }
          )
        )
      );
    } catch (err) {
      console.warn(`Notif prorrogacao falhou: ${err instanceof Error ? err.message : err}`);
    }

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ custodyId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { custodyId } = await params;
    const body = await request.json();

    if (!["approve", "reject"].includes(body?.action)) {
      throw new AuthError(400, "action deve ser 'approve' ou 'reject'");
    }

    const supabase = getAdminClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!["admin", "supervisor", "gestor"].includes((profile?.role as string) || "")) {
      throw new AuthError(403, "Apenas o almoxarifado pode decidir a prorrogação");
    }

    const { data: ext } = await supabase
      .from("tool_extension_requests")
      .select("*")
      .eq("custody_id", custodyId)
      .eq("status", "pending")
      .maybeSingle();
    if (!ext) throw new AuthError(404, "Nenhuma prorrogação pendente para esta custódia");

    const { data: custody } = await supabase
      .from("tool_custody")
      .select("id, user_id, tool_id, unit_id, expected_return_at, service_order_id")
      .eq("id", custodyId)
      .maybeSingle();
    if (!custody) throw new AuthError(404, "Custódia não encontrada");

    const approved = body.action === "approve";
    // O operador pode conceder uma data diferente da pedida (seção 17).
    const finalDate = approved
      ? body.approved_return_at || ext.requested_return_at
      : null;

    const { error: updErr } = await supabase
      .from("tool_extension_requests")
      .update({
        status: approved ? "approved" : "rejected",
        approved_return_at: finalDate,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        decision_notes: body.decision_notes || null,
      })
      .eq("id", ext.id);
    if (updErr) throw new Error(updErr.message);

    if (approved) {
      const { error: custErr } = await supabase
        .from("tool_custody")
        .update({ expected_return_at: finalDate })
        .eq("id", custodyId);
      if (custErr) throw new Error(custErr.message);
    }

    await recordToolEvent(supabase, {
      tool_id: custody.tool_id,
      unit_id: custody.unit_id,
      custody_id: custodyId,
      event_type: approved ? "prorrogacao_aprovada" : "prorrogacao_recusada",
      description: approved
        ? "Prorrogação aprovada pelo almoxarifado"
        : "Prorrogação recusada pelo almoxarifado",
      technician_id: custody.user_id,
      almoxarife_id: user.id,
      actor_id: user.id,
      service_order_id: custody.service_order_id,
      notes: body.decision_notes || null,
      metadata: {
        previous_return_at: custody.expected_return_at,
        new_return_at: finalDate,
        requested_return_at: ext.requested_return_at,
      },
    });

    try {
      const { createNotification } = await import("@/lib/api-helpers/notifications");
      await createNotification(
        custody.user_id as string,
        approved ? "Prorrogação aprovada" : "Prorrogação recusada",
        approved
          ? `Novo prazo de devolução: ${new Date(finalDate as string).toLocaleDateString("pt-BR")}.`
          : `Seu pedido de prorrogação foi recusado. ${body.decision_notes ?? ""}`.trim(),
        "general",
        { custody_id: custodyId, kind: approved ? "extension_approved" : "extension_rejected" },
        { priority: "normal" }
      );
    } catch (err) {
      console.warn(`Notif decisao prorrogacao falhou: ${err instanceof Error ? err.message : err}`);
    }

    logAudit({
      userId: user.id,
      action: approved ? "tool_extension.approved" : "tool_extension.rejected",
      entityType: "tool_custody",
      entityId: custodyId,
      newData: { extension_id: ext.id, approved_return_at: finalDate },
    });

    return jsonResponse({ ok: true, approved, approved_return_at: finalDate });
  } catch (error) {
    return errorResponse(error);
  }
}
