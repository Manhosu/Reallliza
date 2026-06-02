import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateRequest,
  checkRole,
  AuthError,
} from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { recalculateTechnicianScore } from "@/lib/evaluation/recalculate";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * POST /api/service-orders/[id]/rework
 * Gera uma OS de retrabalho a partir da OS original.
 *
 * Body: { specialty_id?: string, reason: string }
 *
 * O que faz:
 * 1. Valida que a OS original está completed/invoiced (não dá pra retrabalhar
 *    OS pendente ou em andamento — não faz sentido).
 * 2. Insere nova OS com parent_service_order_id=ID original, is_rework=true,
 *    rework_specialty_id, rework_reason, herda cliente/endereço/title.
 * 3. Penaliza technician_specialty_scores.score_avg da especialidade afetada
 *    (-1.0, clamp em 1.0 — nunca chega a 0).
 * 4. Recalcula scores globais do técnico.
 * 5. Notifica o técnico (priority=urgent).
 *
 * Apenas admin.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id: parentId } = await params;
    const body = await request.json();
    const { specialty_id, reason } = body as {
      specialty_id?: string;
      reason?: string;
    };

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new AuthError(400, "Informe o motivo do retrabalho.");
    }

    const supabase = getAdminClient();

    const { data: parent, error: findErr } = await supabase
      .from("service_orders")
      .select("*")
      .eq("id", parentId)
      .single();

    if (findErr || !parent) {
      throw new AuthError(404, `OS ${parentId} não encontrada`);
    }

    if (!["completed", "invoiced"].includes(parent.status as string)) {
      throw new AuthError(
        400,
        "Só é possível gerar retrabalho de OS concluída ou faturada."
      );
    }

    const technicianId = (parent as { technician_id?: string | null })
      .technician_id;

    // Cria OS filha. Herdamos dados de cliente/endereço/título.
    const childPayload: Record<string, unknown> = {
      title: `Retrabalho — ${(parent as { title?: string }).title ?? ""}`.slice(
        0,
        200
      ),
      description: (parent as { description?: string }).description ?? null,
      client_name: (parent as { client_name?: string }).client_name ?? null,
      client_phone: (parent as { client_phone?: string }).client_phone ?? null,
      client_email: (parent as { client_email?: string }).client_email ?? null,
      client_document:
        (parent as { client_document?: string }).client_document ?? null,
      address_street:
        (parent as { address_street?: string }).address_street ?? null,
      address_number:
        (parent as { address_number?: string }).address_number ?? null,
      address_complement:
        (parent as { address_complement?: string }).address_complement ?? null,
      address_neighborhood:
        (parent as { address_neighborhood?: string }).address_neighborhood ??
        null,
      address_city:
        (parent as { address_city?: string }).address_city ?? null,
      address_state:
        (parent as { address_state?: string }).address_state ?? null,
      address_zip: (parent as { address_zip?: string }).address_zip ?? null,
      geo_lat: (parent as { geo_lat?: number }).geo_lat ?? null,
      geo_lng: (parent as { geo_lng?: number }).geo_lng ?? null,
      technician_id: technicianId ?? null,
      partner_id: (parent as { partner_id?: string }).partner_id ?? null,
      priority: (parent as { priority?: string }).priority ?? "high",
      status: technicianId ? "assigned" : "pending",
      created_by: user.id,
      parent_service_order_id: parentId,
      is_rework: true,
      rework_specialty_id: specialty_id ?? null,
      rework_reason: reason.trim(),
    };

    const { data: child, error: insErr } = await supabase
      .from("service_orders")
      .insert(childPayload)
      .select()
      .single();

    if (insErr) {
      console.error(`Failed to create rework: ${insErr.message}`);
      throw new Error(`Falha ao criar retrabalho: ${insErr.message}`);
    }

    // Penalty na especialidade afetada (-1.0, clamp em 1.0)
    if (technicianId && specialty_id) {
      const { data: existing } = await supabase
        .from("technician_specialty_scores")
        .select("score_avg, os_count")
        .eq("technician_id", technicianId)
        .eq("specialty_id", specialty_id)
        .maybeSingle();

      const currentAvg = Number(existing?.score_avg ?? 5);
      const newAvg = Math.max(1, currentAvg - 1);

      await supabase.from("technician_specialty_scores").upsert(
        {
          technician_id: technicianId,
          specialty_id,
          score_avg: newAvg,
          os_count: existing?.os_count ?? 0,
          last_recalc_at: new Date().toISOString(),
        },
        { onConflict: "technician_id,specialty_id" }
      );
    }

    // Recalcula scores globais (overall_score, level) refletindo o retrabalho.
    if (technicianId) {
      try {
        await recalculateTechnicianScore(supabase, technicianId);
      } catch (err) {
        console.warn("recalculateTechnicianScore after rework failed:", err);
      }

      // Notifica o técnico (urgent — som Realliza)
      try {
        await createNotification(
          technicianId,
          "OS gerou retrabalho",
          `OS #${(parent as { order_number?: number }).order_number ?? ""} precisa ser refeita. Motivo: ${reason.slice(0, 120)}`,
          "os_rework",
          {
            parent_service_order_id: parentId,
            child_service_order_id: (child as { id: string }).id,
          },
          { priority: "urgent" }
        );
      } catch (err) {
        console.warn("rework notify failed:", err);
      }
    }

    logAudit({
      userId: user.id,
      action: "service_order.rework_created",
      entityType: "service_order",
      entityId: (child as { id: string }).id,
      newData: {
        parent_service_order_id: parentId,
        specialty_id: specialty_id ?? null,
        reason: reason.trim(),
      },
    });

    return jsonResponse(child, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
