import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { recordToolEvent } from "@/lib/tools/events";

/**
 * POST /api/tools/custody/[custodyId]/report-damage
 * O técnico comunica um dano sem esperar a devolução (spec seções 6 e 28:
 * "Danos comunicados" é um dos indicadores do dashboard do almoxarifado).
 *
 * A custódia continua ativa — comunicar dano não devolve a ferramenta.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ custodyId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { custodyId } = await params;
    const body = await request.json().catch(() => ({}));

    if (!body?.description || typeof body.description !== "string") {
      throw new AuthError(400, "Descreva o dano");
    }

    const supabase = getAdminClient();

    const { data: custody } = await supabase
      .from("tool_custody")
      .select("id, user_id, tool_id, unit_id, checked_in_at, service_order_id")
      .eq("id", custodyId)
      .maybeSingle();

    if (!custody) throw new AuthError(404, "Custódia não encontrada");
    if (custody.checked_in_at) throw new AuthError(400, "Esta custódia já foi encerrada");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    const isOperator = ["admin", "supervisor", "gestor"].includes(
      (profile?.role as string) || ""
    );
    if (custody.user_id !== user.id && !isOperator) {
      throw new AuthError(403, "Só o responsável pela custódia pode comunicar o dano");
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("tool_custody")
      .update({ damage_reported_at: now, damage_description: body.description })
      .eq("id", custodyId);
    if (error) throw new Error(error.message);

    await recordToolEvent(supabase, {
      tool_id: custody.tool_id,
      unit_id: custody.unit_id,
      custody_id: custodyId,
      event_type: "dano",
      description: "Dano comunicado pelo técnico",
      technician_id: custody.user_id,
      actor_id: user.id,
      service_order_id: custody.service_order_id,
      notes: body.description,
      photos: Array.isArray(body.photos) ? body.photos : [],
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
            "Dano comunicado",
            `${profile?.full_name ?? "Um técnico"} comunicou um dano: ${body.description}`,
            "general",
            { custody_id: custodyId, kind: "damage_reported" },
            { priority: "high" }
          )
        )
      );
    } catch (err) {
      console.warn(`Notif dano falhou: ${err instanceof Error ? err.message : err}`);
    }

    return jsonResponse({ ok: true, damage_reported_at: now });
  } catch (error) {
    return errorResponse(error);
  }
}
