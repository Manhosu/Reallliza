import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateRequest,
  checkRole,
} from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const supabase = getAdminClient();
    const searchParams = request.nextUrl.searchParams;

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const action = searchParams.get("action");
    const entityType = searchParams.get("entity_type");
    const userId = searchParams.get("user_id");

    const offset = (page - 1) * limit;

    let query = supabase
      .from("audit_logs")
      .select(
        "*, user:profiles!audit_logs_user_id_fkey(id, full_name, email)",
        { count: "exact" }
      );

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
    }

    if (action) {
      query = query.ilike("action", `%${action}%`);
    }

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to search audit logs: ${error.message}`);
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
