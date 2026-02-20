import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/service-orders/my
 * List service orders for the authenticated user.
 * Technicians see their assigned OS; partners see their partner OS.
 * Supports pagination and filters.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const offset = (page - 1) * limit;
    const supabase = getAdminClient();

    let query = supabase
      .from("service_orders")
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone, avatar_url),
        partner:partners!service_orders_partner_id_fkey(id, company_name, trading_name, contact_name)
      `,
        { count: "exact" }
      );

    // Always filter by user
    if (user.role === "technician") {
      query = query.eq("technician_id", user.id);
    } else if (user.role === "partner") {
      const { data: partnerData } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (partnerData) {
        query = query.eq("partner_id", partnerData.id);
      } else {
        return jsonResponse({ data: [], meta: { total: 0, page, limit, total_pages: 0 } });
      }
    }
    // admin/manager see all (same as /api/service-orders)

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,client_name.ilike.%${search}%,address_city.ilike.%${search}%`
      );
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch my service orders: ${error.message}`);
      throw new Error("Failed to fetch service orders");
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
