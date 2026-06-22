import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

function parsePrice(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function parseHours(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  // 3 casas decimais — permite 0.10 (6min/m2), 0.25 (15min/m), etc.
  return Math.round(n * 1000) / 1000;
}

function sanitizePhotos(value: unknown): Array<{
  url: string;
  thumbnail_url?: string | null;
  position?: number;
  alt_text?: string | null;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (p): p is { url: string } =>
        !!p && typeof p === "object" && typeof (p as { url?: unknown }).url === "string"
    )
    .map((p, idx) => {
      const r = p as Record<string, unknown>;
      return {
        url: String(r.url),
        thumbnail_url:
          typeof r.thumbnail_url === "string" ? r.thumbnail_url : null,
        position:
          typeof r.position === "number" && r.position >= 0
            ? Math.floor(r.position)
            : idx,
        alt_text: typeof r.alt_text === "string" ? r.alt_text : null,
      };
    });
}

/**
 * GET /api/services
 * Lista o catálogo de serviços com a categoria.
 * Query: include_inactive=true, category_id, search.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const sp = request.nextUrl.searchParams;
    const includeInactive = sp.get("include_inactive") === "true";
    const categoryId = sp.get("category_id");
    const search = sp.get("search");

    const supabase = getAdminClient();

    let query = supabase
      .from("services")
      .select("*, category:service_categories(id, name)")
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Failed to list services: ${error.message}`);
      throw new Error("Falha ao listar serviços");
    }

    // A loja parceira nunca vê o preço de repasse.
    if (user.role === "partner") {
      const safe = (data || []).map((s) => {
        const row = { ...s } as Record<string, unknown>;
        delete row.payout_price;
        return row;
      });
      return jsonResponse(safe);
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/services
 * Cria um serviço no catálogo. Apenas admin.
 * Body: { name, description?, category_id?, unit?, commercial_price?,
 *         payout_price?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      throw new AuthError(400, "Nome do serviço é obrigatório");
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("services")
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        category_id: body.category_id || null,
        unit: body.unit?.trim() || "m2",
        commercial_price: parsePrice(body.commercial_price),
        payout_price: parsePrice(body.payout_price),
        estimated_time_hours: parseHours(body.estimated_time_hours),
        photos: sanitizePhotos(body.photos),
        is_active: body.is_active !== undefined ? !!body.is_active : true,
        created_by: user.id,
      })
      .select("*, category:service_categories(id, name)")
      .single();

    if (error) {
      console.error(`Failed to create service: ${error.message}`);
      throw new Error("Falha ao criar serviço");
    }

    logAudit({
      userId: user.id,
      action: "service.created",
      entityType: "service",
      entityId: data.id,
      newData: {
        name: data.name,
        commercial_price: data.commercial_price,
        payout_price: data.payout_price,
      },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
