import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/service-categories
 * Lista as categorias do catálogo de serviços.
 * Query: include_inactive=true para incluir desativadas.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);

    const includeInactive =
      request.nextUrl.searchParams.get("include_inactive") === "true";

    const supabase = getAdminClient();

    let query = supabase
      .from("service_categories")
      .select("*")
      .order("order_index", { ascending: true })
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Failed to list service categories: ${error.message}`);
      throw new Error("Falha ao listar categorias");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/service-categories
 * Cria uma categoria. Apenas admin.
 * Body: { name, description?, order_index?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      throw new AuthError(400, "Nome da categoria é obrigatório");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("service_categories")
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        order_index:
          body.order_index !== undefined ? Number(body.order_index) || 0 : 0,
        is_active: body.is_active !== undefined ? !!body.is_active : true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AuthError(409, "Já existe uma categoria com esse nome");
      }
      console.error(`Failed to create service category: ${error.message}`);
      throw new Error("Falha ao criar categoria");
    }

    logAudit({
      userId: user.id,
      action: "service_category.created",
      entityType: "service_category",
      entityId: data.id,
      newData: { name: data.name },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
