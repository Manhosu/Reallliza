import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

interface IncomingScore {
  checklist_item_id?: string | null;
  item_label?: string;
  weight?: number;
  score?: number;
}

/**
 * GET /api/quality-evaluations
 * Lista as avaliações de qualidade. RBAC admin/manager.
 * Query: technician_id (filtro opcional).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const technicianId =
      request.nextUrl.searchParams.get("technician_id") || null;

    const supabase = getAdminClient();

    let query = supabase
      .from("quality_evaluations")
      .select(
        `
        *,
        technician:profiles!technician_id(id, full_name),
        specialty:specialties(id, name),
        service_order:service_orders(id, order_number, client_name)
      `
      )
      .order("created_at", { ascending: false });

    if (technicianId) {
      query = query.eq("technician_id", technicianId);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Failed to list quality evaluations: ${error.message}`);
      throw new Error("Falha ao listar avaliações de qualidade");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/quality-evaluations
 * Cria uma avaliação de qualidade com os scores do checklist.
 * RBAC admin/manager.
 * Body: { service_order_id, technician_id, specialty_id?, needs_rework?,
 *         notes?, scores: [{ checklist_item_id?, item_label, weight, score }] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const body = await request.json();

    if (!body.service_order_id) {
      throw new AuthError(400, "service_order_id é obrigatório");
    }
    if (!body.technician_id) {
      throw new AuthError(400, "technician_id é obrigatório");
    }
    if (!Array.isArray(body.scores) || body.scores.length === 0) {
      throw new AuthError(400, "Pontue ao menos um critério do checklist");
    }

    const incoming: IncomingScore[] = body.scores;
    let weightedSum = 0;
    let weightTotal = 0;
    const rows = incoming.map((s) => {
      const score = Number(s.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) {
        throw new AuthError(400, "Cada critério deve ter nota de 1 a 5");
      }
      const weight = Math.max(1, Number(s.weight) || 1);
      weightedSum += score * weight;
      weightTotal += weight;
      return {
        checklist_item_id: s.checklist_item_id || null,
        item_label: String(s.item_label || "Critério").trim(),
        weight,
        score,
      };
    });

    // Score 0-100: média ponderada (1-5) normalizada.
    const evalScore =
      weightTotal > 0
        ? Math.round((weightedSum / weightTotal) * 20 * 100) / 100
        : 0;

    const supabase = getAdminClient();

    const { data: evaluation, error: evalErr } = await supabase
      .from("quality_evaluations")
      .insert({
        service_order_id: body.service_order_id,
        technician_id: body.technician_id,
        specialty_id: body.specialty_id || null,
        evaluator_id: user.id,
        score: evalScore,
        needs_rework: !!body.needs_rework,
        notes: typeof body.notes === "string" ? body.notes.trim() : null,
      })
      .select()
      .single();

    if (evalErr || !evaluation) {
      console.error(`Failed to create quality evaluation: ${evalErr?.message}`);
      throw new Error("Falha ao criar a avaliação");
    }

    const { error: scoresErr } = await supabase
      .from("quality_evaluation_scores")
      .insert(rows.map((r) => ({ evaluation_id: evaluation.id, ...r })));

    if (scoresErr) {
      // rollback da avaliação se os scores falharem
      await supabase.from("quality_evaluations").delete().eq("id", evaluation.id);
      throw new Error("Falha ao salvar os critérios da avaliação");
    }

    logAudit({
      userId: user.id,
      action: "quality_evaluation.created",
      entityType: "quality_evaluation",
      entityId: evaluation.id,
      newData: {
        technician_id: body.technician_id,
        score: evalScore,
        needs_rework: !!body.needs_rework,
      },
    });

    return jsonResponse(evaluation, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
