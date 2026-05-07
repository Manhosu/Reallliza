import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

function validateScore(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiKeyError(400, `${field} must be an integer 1..5`);
  }
  if (value < 1 || value > 5) {
    throw new ApiKeyError(400, `${field} must be between 1 and 5`);
  }
  return value;
}

/**
 * POST /api/external/ratings
 * Recebe avaliação do cliente sobre o serviço (vinda do Garantias após o
 * cliente preencher o form via WhatsApp). Idempotente por external_id.
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

    const quality = validateScore(body.quality, "quality");
    const punctuality = validateScore(body.punctuality, "punctuality");
    const communication = validateScore(body.communication, "communication");

    const supabase = getAdminClient();

    const row = {
      id: body.external_id,
      ticket_id: body.ticket_id || null,
      service_order_id: body.enterprise_os_id || null,
      technician_user_id: body.technician_user_id,
      quality,
      punctuality,
      communication,
      comment: body.comment || null,
    };

    const { data, error } = await supabase
      .from("customer_ratings")
      .upsert(row, { onConflict: "id" })
      .select("id, technician_user_id, quality, punctuality, communication")
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
      newData: {
        technician_user_id: body.technician_user_id,
        quality,
        punctuality,
        communication,
      },
    });

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
 * Lista avaliações do cliente, opcionalmente filtradas por técnico.
 * Retorna os comentários, scores, e nome do técnico (join com profiles).
 * Usado pelo painel /dashboard/avaliacoes do Garantias.
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

    // Estatísticas agregadas
    const list = ratings || [];
    const summary =
      list.length > 0
        ? {
            count: list.length,
            avg_quality:
              list.reduce((s, r) => s + r.quality, 0) / list.length,
            avg_punctuality:
              list.reduce((s, r) => s + r.punctuality, 0) / list.length,
            avg_communication:
              list.reduce((s, r) => s + r.communication, 0) / list.length,
          }
        : { count: 0 };

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
