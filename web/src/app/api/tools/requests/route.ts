import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/requests?status=pending|approved|rejected|all
 * Lista solicitacoes de ferramenta. Por padrao traz pending ordenado por
 * prioridade DESC e created_at ASC (urgent vem primeiro, dentro do mesmo
 * nivel o mais antigo). Admin/supervisor ve tudo; tecnico ve so os seus.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pending";

    const supabase = getAdminClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role as string | undefined;
    const isAdmin = role === "admin" || role === "supervisor" || role === "gestor";

    let query = supabase
      .from("tool_requests")
      .select(
        `
        id,
        requester_id,
        tool_id,
        tool_name,
        quantity,
        justification,
        priority,
        status,
        rejection_reason,
        created_at,
        approved_at,
        released_at,
        rejected_at,
        custody_id,
        requester:profiles!tool_requests_requester_id_fkey(id, full_name, role)
      `
      )
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (!isAdmin) {
      query = query.eq("requester_id", user.id);
    }

    const { data, error } = await query.limit(200);

    if (error) {
      throw new Error(`Failed to fetch tool_requests: ${error.message}`);
    }

    return jsonResponse({ requests: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
