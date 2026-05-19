import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/profile/me/performance
 * Resumo de desempenho do profissional logado: total de avaliações,
 * OS concluídas, média geral e avaliações recentes.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    const { data: ratings } = await supabase
      .from("customer_ratings")
      .select("overall_score, comment, created_at")
      .eq("technician_user_id", user.id)
      .order("created_at", { ascending: false });

    const list = (ratings as Array<{
      overall_score: number | null;
      comment: string | null;
      created_at: string;
    }> | null) || [];

    const overalls = list
      .map((r) => r.overall_score)
      .filter((v): v is number => typeof v === "number");
    const avgOverall =
      overalls.length > 0
        ? Math.round(
            (overalls.reduce((s, v) => s + v, 0) / overalls.length) * 100
          ) / 100
        : null;

    const { count: completed } = await supabase
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .eq("technician_id", user.id)
      .in("status", ["completed", "invoiced"]);

    const recentReviews = list.slice(0, 5).map((r) => ({
      comment: r.comment,
      score: r.overall_score,
      created_at: r.created_at,
    }));

    return jsonResponse({
      total_ratings: list.length,
      total_services_completed: completed || 0,
      avg_overall: avgOverall,
      recent_reviews: recentReviews,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
