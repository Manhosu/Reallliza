import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

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

    // Jessica 10/08: `available=true` (catalogo do app) filtrava so' por
    // quantidade. Como manutencao/baixa/devolucao-danificada mudam apenas o
    // `status` e nao mexem em `quantity_available`, ferramenta em manutencao,
    // aposentada, danificada ou extraviada continuava aparecendo pro tecnico
    // pedir. Agora exige status 'available' tambem.
    if (available === "true") {
      query = query.gt("quantity_available", 0).eq("status", "available");
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch tools: ${error.message}`);
      throw new Error("Failed to fetch tools");
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
    ]);
    const insertData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED.has(k) && v !== undefined && v !== "") insertData[k] = v;
    }
    // Aceita tanto image_url (legacy DTO) quanto photo_url
    const finalPhoto = body.photo_url ?? body.image_url;
    if (finalPhoto) insertData.photo_url = finalPhoto;

    const { data: tool, error } = await supabase
      .from("tool_inventory")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`Failed to create tool: ${error.message}`);
      throw new Error(`Falha ao criar ferramenta: ${error.message}`);
    }

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
