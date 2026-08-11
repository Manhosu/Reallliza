import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/tools/my-custody
 * Custódias do usuário autenticado.
 *
 * ?include_returned=true traz também as já devolvidas — é o que alimenta a
 * aba Histórico do app. O parâmetro era ignorado, então a rota sempre filtrava
 * `checked_in_at IS NULL` e o app, que depois filtra pelas devolvidas, ficava
 * matematicamente sempre vazio.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const includeReturned =
      request.nextUrl.searchParams.get("include_returned") === "true";

    const supabase = getAdminClient();

    let query = supabase
      .from("tool_custody")
      .select(
        `
        *,
        tool:tool_inventory(id, name, serial_number, category, photo_url),
        service_order:service_orders(id, order_number, title)
      `
      )
      .eq("user_id", user.id);

    if (!includeReturned) {
      query = query.is("checked_in_at", null);
    }

    const { data, error } = await query.order("checked_out_at", {
      ascending: false,
    });

    if (error) {
      console.error(`Failed to fetch my custody: ${error.message}`);
      throw new Error("Failed to fetch custody records");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}
