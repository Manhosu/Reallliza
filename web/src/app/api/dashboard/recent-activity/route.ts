import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

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

/**
 * Returns the IDs of service orders accessible by the given user based on their role.
 */
async function getAccessibleOrderIds(
  userId: string,
  userRole: string
): Promise<string[]> {
  const supabase = getAdminClient();

  let query = supabase.from("service_orders").select("id");

  if (userRole === "partner") {
    const partnerId = await resolvePartnerId(userId, userRole);
    if (!partnerId) return [];
    query = query.eq("partner_id", partnerId);
  } else if (userRole === "technician") {
    query = query.eq("technician_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Failed to fetch accessible order IDs: ${error.message}`);
    return [];
  }

  return (data || []).map((row: { id: string }) => row.id);
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();

    // For non-admin roles we first determine the set of service order IDs the user can access
    let serviceOrderIds: string[] | null = null;

    if (user.role !== "admin") {
      serviceOrderIds = await getAccessibleOrderIds(user.id, user.role);
      if (serviceOrderIds.length === 0) {
        return jsonResponse([]);
      }
    }

    let query = supabase
      .from("audit_logs")
      .select(
        `
        *,
        user:profiles!audit_logs_user_id_fkey(id, full_name, avatar_url, role)
      `
      )
      .order("created_at", { ascending: false })
      .limit(10);

    if (serviceOrderIds) {
      query = query.in("entity_id", serviceOrderIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch recent activity: ${error.message}`);
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
