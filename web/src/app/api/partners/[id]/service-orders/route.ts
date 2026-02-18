import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/partners/[id]/service-orders
 * List service orders for a specific partner with pagination.
 * Accessible by: any authenticated user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    // Verify the partner exists
    const { data: partner, error: findError } = await supabase
      .from("partners")
      .select("id")
      .eq("id", id)
      .single();

    if (findError || !partner) {
      return jsonResponse(
        { message: `Partner with ID ${id} not found` },
        404
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("service_orders")
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone, avatar_url)
      `,
        { count: "exact" }
      )
      .eq("partner_id", id);

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,title.ilike.%${search}%,client_name.ilike.%${search}%`
      );
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(
        `Failed to fetch service orders for partner ${id}: ${error.message}`
      );
      return jsonResponse(
        { message: "Failed to fetch partner service orders" },
        500
      );
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
