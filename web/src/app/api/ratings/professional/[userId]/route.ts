import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/ratings/professional/[userId]
 * Get all ratings for a specific professional plus average scores.
 * Admin only.
 * Returns: { ratings: [...], averages: { quality, punctuality, organization, communication, overall }, total }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const { userId } = await params;

    const supabase = getAdminClient();

    // Fetch all ratings for this professional
    const { data: ratings, error } = await supabase
      .from("professional_ratings")
      .select(
        `
        *,
        professional:profiles!professional_ratings_professional_id_fkey(id, full_name),
        rated_by_user:profiles!professional_ratings_rated_by_fkey(id, full_name),
        service_order:service_orders(id, title)
      `
      )
      .eq("professional_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Failed to fetch ratings for professional ${userId}: ${error.message}`);
      throw new Error("Failed to fetch professional ratings");
    }

    const ratingsList = ratings || [];
    const total = ratingsList.length;

    // Calculate averages
    let averages = {
      quality: 0,
      punctuality: 0,
      organization: 0,
      communication: 0,
      overall: 0,
    };

    if (total > 0) {
      const sums = ratingsList.reduce(
        (acc, r) => ({
          quality: acc.quality + (r.quality_score || 0),
          punctuality: acc.punctuality + (r.punctuality_score || 0),
          organization: acc.organization + (r.organization_score || 0),
          communication: acc.communication + (r.communication_score || 0),
          overall: acc.overall + (r.overall_score || 0),
        }),
        { quality: 0, punctuality: 0, organization: 0, communication: 0, overall: 0 }
      );

      averages = {
        quality: Math.round((sums.quality / total) * 100) / 100,
        punctuality: Math.round((sums.punctuality / total) * 100) / 100,
        organization: Math.round((sums.organization / total) * 100) / 100,
        communication: Math.round((sums.communication / total) * 100) / 100,
        overall: Math.round((sums.overall / total) * 100) / 100,
      };
    }

    return jsonResponse({
      ratings: ratingsList,
      averages,
      total,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
