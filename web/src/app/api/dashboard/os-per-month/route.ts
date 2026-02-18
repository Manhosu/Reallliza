import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/** Portuguese month abbreviations (0-indexed). */
const MONTH_NAMES_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/**
 * Resolves the partner table ID for a user with the partner role.
 */
async function resolvePartnerId(userId: string, userRole: string): Promise<string | null> {
  if (userRole !== "partner") return null;

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id")
    .eq("user_id", userId)
    .single();

  return data?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const fromDate = twelveMonthsAgo.toISOString();

    const partnerId = await resolvePartnerId(user.id, user.role);

    let query = supabase
      .from("service_orders")
      .select("created_at")
      .gte("created_at", fromDate)
      .order("created_at", { ascending: true });

    if (user.role === "partner" && partnerId) {
      query = query.eq("partner_id", partnerId);
    } else if (user.role === "technician") {
      query = query.eq("technician_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch OS per month: ${error.message}`);
    }

    // Build a map with keys "YYYY-MM" -> count
    const countMap: Record<string, number> = {};

    // Pre-fill with zeroes for all 12 months so the response is always complete
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      countMap[key] = 0;
    }

    // Tally
    for (const row of data || []) {
      const d = new Date(row.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in countMap) {
        countMap[key]++;
      }
    }

    // Convert to array with Portuguese month names
    const result = Object.entries(countMap).map(([key, count]) => {
      const [, monthStr] = key.split("-");
      const monthIndex = parseInt(monthStr, 10) - 1;
      return {
        month: MONTH_NAMES_PT[monthIndex],
        count,
      };
    });

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
