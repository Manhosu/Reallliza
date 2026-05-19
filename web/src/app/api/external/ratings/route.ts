import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { recalculateTechnicianScore } from "@/lib/evaluation/recalculate";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

// As 5 dimensões do José + as 3 legadas (aceitas por compatibilidade).
const DIMENSIONS = [
  "educacao",
  "organizacao",
  "limpeza",
  "atendimento",
  "satisfacao",
  "quality",
  "punctuality",
  "communication",
] as const;

/** Valida uma dimensão opcional: ausente → undefined; presente → 1..5 ou erro. */
function optionalScore(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 5
  ) {
    throw new ApiKeyError(400, `${field} must be an integer 1..5`);
  }
  return value;
}

/** Média das dimensões não-nulas de uma linha (escala 1-5). */
function rowAverage(row: Record<string, unknown>): number | null {
  const vals = DIMENSIONS.map((d) => row[d]).filter(
    (v): v is number => typeof v === "number"
  );
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/**
 * POST /api/external/ratings
 * Recebe a avaliação do cliente (vinda do Garantias após o cliente
 * preencher o form pós-OS). Idempotente por external_id. Aceita as 5
 * dimensões (educação, organização, limpeza, atendimento, satisfação)
 * — e ainda tolera as 3 legadas.
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateApiKey(request);
    const body = await request.json();

    if (!body.external_id) {
      throw new ApiKeyError(400, "external_id is required");
    }
    if (!body.technician_user_id) {
      throw new ApiKeyError(400, "technician_user_id is required");
    }

    const dims: Record<string, number> = {};
    for (const d of DIMENSIONS) {
      const v = optionalScore(body[d], d);
      if (v !== undefined) dims[d] = v;
    }
    if (Object.keys(dims).length === 0) {
      throw new ApiKeyError(400, "Pelo menos uma dimensão de nota é obrigatória");
    }

    const supabase = getAdminClient();

    const row = {
      id: body.external_id,
      ticket_id: body.ticket_id || null,
      service_order_id: body.enterprise_os_id || null,
      technician_user_id: body.technician_user_id,
      comment: body.comment || null,
      ...dims,
    };

    const { data, error } = await supabase
      .from("customer_ratings")
      .upsert(row, { onConflict: "id" })
      .select("id, technician_user_id, overall_score")
      .single();

    if (error || !data) {
      console.error(`Failed to upsert customer_rating: ${error?.message}`);
      throw new Error("Failed to sync rating");
    }

    logAudit({
      userId: SYSTEM_USER_ID,
      action: "customer_rating.synced_external",
      entityType: "customer_rating",
      entityId: data.id,
      newData: { technician_user_id: body.technician_user_id, ...dims },
    });

    // Recalcula o score/nível do profissional (fonte CLIENTE mudou).
    try {
      await recalculateTechnicianScore(supabase, body.technician_user_id);
    } catch (e) {
      console.error("recalculateTechnicianScore error:", e);
    }

    return jsonResponse(data);
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`Ratings sync error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}

/**
 * GET /api/external/ratings?technician_user_id=...&limit=50
 * Lista avaliações do cliente. Usado pelo painel do Garantias.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateApiKey(request);
    const url = request.nextUrl;
    const technicianId = url.searchParams.get("technician_user_id");
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50", 10) || 50,
      200
    );

    const supabase = getAdminClient();

    let query = supabase
      .from("customer_ratings")
      .select(
        `
        id,
        ticket_id,
        service_order_id,
        technician_user_id,
        quality,
        punctuality,
        communication,
        educacao,
        organizacao,
        limpeza,
        atendimento,
        satisfacao,
        overall_score,
        comment,
        created_at,
        technician:profiles!customer_ratings_technician_user_id_fkey(id, full_name)
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (technicianId) {
      query = query.eq("technician_user_id", technicianId);
    }

    const { data: ratings, error } = await query;

    if (error) {
      console.error(`Failed to list customer_ratings: ${error.message}`);
      return jsonResponse({ message: "Erro ao listar avaliações" }, 500);
    }

    const list = ratings || [];
    const overalls = list
      .map((r) =>
        typeof r.overall_score === "number"
          ? r.overall_score
          : rowAverage(r as Record<string, unknown>)
      )
      .filter((v): v is number => typeof v === "number");

    const summary = {
      count: list.length,
      avg_overall:
        overalls.length > 0
          ? overalls.reduce((s, v) => s + v, 0) / overalls.length
          : 0,
    };

    return jsonResponse({ ratings: list, summary });
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`Ratings list error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
