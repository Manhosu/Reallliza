import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

interface ChecklistRow {
  is_active: boolean;
  order_index: number;
}

/**
 * GET /api/specialties
 * Lista as especialidades técnicas com seus itens de checklist ativos.
 * Query: include_inactive=true.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);

    const includeInactive =
      request.nextUrl.searchParams.get("include_inactive") === "true";

    const supabase = getAdminClient();

    let query = supabase
      .from("specialties")
      .select(
        `
        *,
        checklist:specialty_checklist_items(*)
      `
      )
      .order("order_index", { ascending: true })
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Failed to list specialties: ${error.message}`);
      throw new Error("Falha ao listar especialidades");
    }

    const normalized = (data || []).map(
      (s: { checklist?: ChecklistRow[] }) => ({
        ...s,
        checklist: (s.checklist || [])
          .filter((it) => it.is_active)
          .sort((a, b) => a.order_index - b.order_index),
      })
    );

    return jsonResponse(normalized);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/specialties
 * Cria uma especialidade. Apenas admin.
 * Body: { name, description?, order_index?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      throw new AuthError(400, "Nome da especialidade é obrigatório");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("specialties")
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
        throw new AuthError(409, "Já existe uma especialidade com esse nome");
      }
      console.error(`Failed to create specialty: ${error.message}`);
      throw new Error("Falha ao criar especialidade");
    }

    logAudit({
      userId: user.id,
      action: "specialty.created",
      entityType: "specialty",
      entityId: data.id,
      newData: { name: data.name },
    });

    return jsonResponse({ ...data, checklist: [] }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
