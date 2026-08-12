import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { getAvailabilityByTool } from "@/lib/tools/availability";
import { recordToolEvent } from "@/lib/tools/events";

/**
 * GET /api/tools
 * List tools inventory with pagination and filters.
 * Accessible by all authenticated users.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const available = searchParams.get("available");

    const offset = (page - 1) * limit;
    const supabase = getAdminClient();

    let query = supabase
      .from("tool_inventory")
      .select("*", { count: "exact" });

    if (status) {
      query = query.eq("status", status);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%,serial_number.ilike.%${search}%`
      );
    }

    // Jessica 12/08: a disponibilidade tem de sair da fonte certa.
    // `quantity_available` só é mexida pelo modo quantidade — para tipos
    // controlados ela fica congelada e não diz nada sobre o estoque real.
    // Por isso o filtro `available=true` deixa de ser feito no banco e passa a
    // usar o valor calculado (ver lib/tools/availability).
    if (available === "true") {
      const { data: all, error: allErr } = await query.order("name", {
        ascending: true,
      });
      if (allErr) {
        console.error(`Failed to fetch tools: ${allErr.message}`);
        throw new Error("Failed to fetch tools");
      }

      const rows = (all ?? []) as Array<Record<string, unknown>>;
      const availability = await getAvailabilityByTool(
        supabase,
        rows.map((r) => r.id as string)
      );

      const enriched = rows
        .map((r) => {
          const a = availability.get(r.id as string);
          return {
            ...r,
            tracking_mode: a?.tracking_mode ?? r.tracking_mode ?? "quantity",
            available_quantity: a?.available_quantity ?? 0,
          };
        })
        .filter((r) => (r.available_quantity as number) > 0);

      const paged = enriched.slice(offset, offset + limit);
      return jsonResponse({
        data: paged,
        meta: {
          total: enriched.length,
          page,
          limit,
          total_pages: Math.ceil(enriched.length / limit),
        },
      });
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch tools: ${error.message}`);
      throw new Error("Failed to fetch tools");
    }

    // Enriquece a listagem geral também — o Catálogo mostra a disponibilidade.
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const availability = await getAvailabilityByTool(
      supabase,
      rows.map((r) => r.id as string)
    );

    return jsonResponse({
      data: rows.map((r) => {
        const a = availability.get(r.id as string);
        return {
          ...r,
          tracking_mode: a?.tracking_mode ?? r.tracking_mode ?? "quantity",
          available_quantity: a?.available_quantity ?? 0,
        };
      }),
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

/**
 * POST /api/tools
 * Create a new tool in inventory.
 * Admin-only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const supabase = getAdminClient();

    // Map DTO fields to DB column names + whitelist (Jessica 04/08 bug:
    // form mandava purchase_value que nao existe na tabela e insert
    // falhava com "Failed to create tool")
    const ALLOWED = new Set([
      "name",
      "description",
      "serial_number",
      "category",
      "status",
      "condition",
      "photo_url",
      "purchase_date",
      "notes",
      "quantity_available",
      "patrimony_code",
      "brand",
      "model",
      "photos",
      "default_location",
      "supplier",
      // Jessica 12/08: sem isto na whitelist, o campo era descartado em
      // silêncio e TODO tipo nascia 'quantity' — o modo só mudava depois,
      // como efeito colateral de cadastrar a primeira unidade.
      "tracking_mode",
    ]);
    const insertData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED.has(k) && v !== undefined && v !== "") insertData[k] = v;
    }
    // Aceita tanto image_url (legacy DTO) quanto photo_url
    const finalPhoto = body.photo_url ?? body.image_url;
    if (finalPhoto) insertData.photo_url = finalPhoto;

    if (
      insertData.tracking_mode !== undefined &&
      !["controlled", "quantity"].includes(String(insertData.tracking_mode))
    ) {
      throw new Error("tracking_mode deve ser 'controlled' ou 'quantity'");
    }
    // Tipo controlado tem estoque nas unidades, não no saldo do tipo.
    if (insertData.tracking_mode === "controlled") {
      insertData.quantity_available = 0;
    }

    const { data: tool, error } = await supabase
      .from("tool_inventory")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`Failed to create tool: ${error.message}`);
      throw new Error(`Falha ao criar ferramenta: ${error.message}`);
    }

    await recordToolEvent(supabase, {
      tool_id: tool.id,
      event_type: "cadastro",
      description: `Ferramenta cadastrada: ${tool.name}`,
      status_to: tool.status,
      actor_id: user.id,
      almoxarife_id: user.id,
      metadata: { tracking_mode: tool.tracking_mode },
    });

    // Log audit
    logAudit({
      userId: user.id,
      action: "create",
      entityType: "tool_inventory",
      entityId: tool.id,
      newData: tool as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(tool, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
