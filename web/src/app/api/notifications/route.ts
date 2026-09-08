import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;
    // Marco 4/5, item 3: central de notificacoes organizada por lidas/nao
    // lidas/prioridade -- antes so existia paginacao, sem filtro nenhum.
    const unreadOnly = searchParams.get("unread_only") === "true";
    const priorityOnly = searchParams.get("priority_only") === "true";

    const supabase = getAdminClient();

    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", user.id);

    if (unreadOnly) {
      query = query.is("read_at", null);
    }
    if (priorityOnly) {
      query = query.in("priority", ["high", "urgent"]);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(
        `Failed to fetch notifications for user ${user.id}: ${error.message}`
      );
      throw new Error("Failed to fetch notifications");
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
