import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/ratings
 * List all professional ratings with pagination.
 * Admin only. Supports filtering by professional_id.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const professional_id = searchParams.get("professional_id");

    const offset = (page - 1) * limit;

    const supabase = getAdminClient();

    let query = supabase
      .from("professional_ratings")
      .select(
        `
        *,
        professional:profiles!professional_ratings_professional_id_fkey(id, full_name),
        rated_by_user:profiles!professional_ratings_rated_by_fkey(id, full_name),
        service_order:service_orders(id, title)
      `,
        { count: "exact" }
      );

    if (professional_id) {
      query = query.eq("professional_id", professional_id);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch ratings: ${error.message}`);
      throw new Error("Failed to fetch ratings");
    }

    return jsonResponse({
      data: data || [],
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/ratings
 * Create a new professional rating.
 * Admin only. Scores must be between 1 and 5.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const body = await request.json();

    // Validate required fields
    if (!body.professional_id) {
      throw new AuthError(400, "professional_id is required");
    }

    const scoreFields = [
      "quality_score",
      "punctuality_score",
      "organization_score",
      "communication_score",
    ] as const;

    for (const field of scoreFields) {
      if (body[field] === undefined || body[field] === null) {
        throw new AuthError(400, `${field} is required`);
      }
      const score = Number(body[field]);
      if (!Number.isInteger(score) || score < 1 || score > 5) {
        throw new AuthError(400, `${field} must be an integer between 1 and 5`);
      }
    }

    const supabase = getAdminClient();

    // Verify the professional exists
    const { data: professional, error: profError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", body.professional_id)
      .single();

    if (profError || !professional) {
      throw new AuthError(404, "Professional not found");
    }

    // Verify service order exists if provided
    if (body.service_order_id) {
      const { data: serviceOrder, error: soError } = await supabase
        .from("service_orders")
        .select("id")
        .eq("id", body.service_order_id)
        .single();

      if (soError || !serviceOrder) {
        throw new AuthError(404, "Service order not found");
      }
    }

    // Calculate overall score
    const overall_score =
      (Number(body.quality_score) +
        Number(body.punctuality_score) +
        Number(body.organization_score) +
        Number(body.communication_score)) /
      4;

    const insertData: Record<string, unknown> = {
      professional_id: body.professional_id,
      rated_by: user.id,
      quality_score: Number(body.quality_score),
      punctuality_score: Number(body.punctuality_score),
      organization_score: Number(body.organization_score),
      communication_score: Number(body.communication_score),
      overall_score: Math.round(overall_score * 100) / 100,
    };

    if (body.service_order_id) {
      insertData.service_order_id = body.service_order_id;
    }

    if (body.notes !== undefined && body.notes !== null) {
      insertData.notes = body.notes;
    }

    const { data: rating, error } = await supabase
      .from("professional_ratings")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`Failed to create rating: ${error.message}`);
      throw new Error("Failed to create rating");
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "professional_rating.created",
      entityType: "professional_rating",
      entityId: rating.id,
      newData: rating as Record<string, unknown>,
    });

    return jsonResponse(rating, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
