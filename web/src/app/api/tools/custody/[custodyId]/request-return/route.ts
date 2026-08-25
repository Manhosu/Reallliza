import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { recordToolEvent } from "@/lib/tools/events";

/**
 * POST /api/tools/custody/[custodyId]/request-return
 * O técnico avisa que quer devolver a ferramenta.
 *
 * Spec seção 4, em destaque: "Quando o técnico solicitar devolução, a
 * ferramenta CONTINUA aparecendo na Custódia. Ela somente sai quando o
 * almoxarifado confirmar o recebimento físico." Por isso aqui só marcamos a
 * custódia — quem encerra é o checkin do operador.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ custodyId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { custodyId } = await params;
    const body = await request.json().catch(() => ({}));

    const supabase = getAdminClient();

    const { data: custody } = await supabase
      .from("tool_custody")
      .select("id, user_id, tool_id, unit_id, checked_in_at, return_requested_at, service_order_id")
      .eq("id", custodyId)
      .maybeSingle();

    if (!custody) throw new AuthError(404, "Custódia não encontrada");
    if (custody.checked_in_at) {
      throw new AuthError(400, "Esta custódia já foi encerrada");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    const isOperator = ["admin", "supervisor", "gestor", "almoxarifado"].includes(
      (profile?.role as string) || ""
    );
    if (custody.user_id !== user.id && !isOperator) {
      throw new AuthError(403, "Só o responsável pela custódia pode solicitar a devolução");
    }

    if (custody.return_requested_at) {
      return jsonResponse({ ok: true, already_requested: true });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("tool_custody")
      .update({ return_requested_at: now })
      .eq("id", custodyId);
    if (error) throw new Error(error.message);

    await recordToolEvent(supabase, {
      tool_id: custody.tool_id,
      unit_id: custody.unit_id,
      custody_id: custodyId,
      event_type: "devolucao_solicitada",
      description: "Técnico solicitou a devolução",
      technician_id: custody.user_id,
      actor_id: user.id,
      service_order_id: custody.service_order_id,
      notes: typeof body.notes === "string" ? body.notes : null,
    });

    // Avisa os operadores — a fila de Devoluções depende disso.
    try {
      const { createNotification } = await import("@/lib/api-helpers/notifications");
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .in("role", ["admin", "almoxarifado"])
        .eq("status", "active");
      await Promise.allSettled(
        ((admins ?? []) as Array<{ id: string }>).map((a) =>
          createNotification(
            a.id,
            "Devolução solicitada",
            `${profile?.full_name ?? "Um técnico"} pediu para devolver uma ferramenta.`,
            "general",
            { custody_id: custodyId, kind: "return_requested" },
            { priority: "normal" }
          )
        )
      );
    } catch (err) {
      console.warn(`Notif devolucao_solicitada falhou: ${err instanceof Error ? err.message : err}`);
    }

    return jsonResponse({ ok: true, return_requested_at: now });
  } catch (error) {
    return errorResponse(error);
  }
}
