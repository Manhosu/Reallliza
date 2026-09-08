import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/course-categories
 * Lista as categorias da biblioteca técnica.
 * Query: include_inactive=true para incluir desativadas.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);

    const includeInactive =
      request.nextUrl.searchParams.get("include_inactive") === "true";

    const supabase = getAdminClient();

    let query = supabase
      .from("course_categories")
      .select("*")
      .order("order_index", { ascending: true })
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Failed to list course categories: ${error.message}`);
      throw new Error("Falha ao listar categorias");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/course-categories
 * Cria uma categoria. Apenas admin.
 * Body: { name, description?, icon?, order_index?, is_active? }
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
      .from("course_categories")
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        icon: body.icon?.trim() || null,
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
      console.error(`Failed to create course category: ${error.message}`);
      throw new Error("Falha ao criar categoria");
    }

    logAudit({
      userId: user.id,
      action: "course_category.created",
      entityType: "course_category",
      entityId: data.id,
      newData: { name: data.name },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
