import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

function normalizeUf(value: unknown): string {
  return String(value || "").trim().toUpperCase().slice(0, 2);
}

/**
 * GET /api/regions
 * Lista as regiões de atuação.
 * Query: include_inactive=true para incluir desativadas.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);

    const includeInactive =
      request.nextUrl.searchParams.get("include_inactive") === "true";

    const supabase = getAdminClient();

    let query = supabase
      .from("regions")
      .select("*")
      .order("uf", { ascending: true })
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Failed to list regions: ${error.message}`);
      throw new Error("Falha ao listar regiões");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/regions
 * Cria uma região. Apenas admin.
 * Body: { name, uf, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      throw new AuthError(400, "Nome da região é obrigatório");
    }
    const uf = normalizeUf(body.uf);
    if (uf.length !== 2) {
      throw new AuthError(400, "UF inválida");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("regions")
      .insert({
        name: body.name.trim(),
        uf,
        is_active: body.is_active !== undefined ? !!body.is_active : true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AuthError(409, "Já existe uma região com esse nome e UF");
      }
      console.error(`Failed to create region: ${error.message}`);
      throw new Error("Falha ao criar região");
    }

    logAudit({
      userId: user.id,
      action: "region.created",
      entityType: "region",
      entityId: data.id,
      newData: { name: data.name, uf: data.uf },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
