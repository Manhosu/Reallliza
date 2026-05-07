import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/external/users?roles=technician,partner
 * Lista usuários do Enterprise para sistemas externos (Garantias) fazerem
 * mapping/auto-match de técnico ao criar OS via /external/service-orders.
 *
 * Auth: X-API-Key (mesmo padrão do resto de /external/*).
 *
 * Default: retorna technicians + partners ativos.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateApiKey(request);

    const url = request.nextUrl;
    const rolesParam =
      url.searchParams.get("roles") || "technician,partner";
    const roles = rolesParam
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    if (roles.length === 0) {
      throw new ApiKeyError(400, "roles parameter must not be empty");
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, status")
      .in("role", roles)
      .eq("status", "active")
      .order("full_name", { ascending: true });

    if (error) {
      console.error(`Failed to list external users: ${error.message}`);
      return jsonResponse({ message: "Erro ao listar usuários" }, 500);
    }

    return jsonResponse({ users: data || [] });
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`External Users API error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
