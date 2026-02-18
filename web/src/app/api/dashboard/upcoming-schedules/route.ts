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
 * Returns all service order IDs that belong to the given partner.
 */
async function getPartnerOrderIds(partnerId: string): Promise<string[]> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("service_orders")
    .select("id")
    .eq("partner_id", partnerId);

  if (error) {
    console.error(`Failed to fetch partner order IDs: ${error.message}`);
    return [];
  }

  return (data || []).map((row: { id: string }) => row.id);
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    let query = supabase
      .from("schedules")
      .select(
        `
        *,
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status),
        technician:profiles!schedules_technician_id_fkey(id, full_name, avatar_url)
      `
      )
      .gte("date", today)
      .not("status", "in", '("cancelled","completed")')
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(5);

    // Role-based filtering
    if (user.role === "technician") {
      query = query.eq("technician_id", user.id);
    } else if (user.role === "partner") {
      const partnerId = await resolvePartnerId(user.id, user.role);
      if (!partnerId) {
        return jsonResponse([]);
      }
      const orderIds = await getPartnerOrderIds(partnerId);
      if (orderIds.length === 0) {
        return jsonResponse([]);
      }
      query = query.in("service_order_id", orderIds);
    }
    // Admin sees all

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch upcoming schedules: ${error.message}`);
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
