import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { recordToolEvent } from "@/lib/tools/events";

/**
 * GET /api/tools/units
 * Unidades físicas do inventário (spec seção 9).
 *
 * Query: ?tool_id= &status= &search= &location= &available_for=<request_id>
 *        &page= &limit=
 *
 * `available_for` aplica a regra da seção 12 — ao aprovar um pedido, só podem
 * aparecer unidades do tipo pedido que estejam disponíveis, sem manutenção,
 * sem baixa, sem custódia ativa e sem reserva para OUTRO pedido.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    const supabase = getAdminClient();

    let query = supabase
      .from("tool_units")
      .select(
        `*, tool:tool_inventory(id, name, category, brand, model, tracking_mode)`,
        { count: "exact" }
      );

    const toolId = sp.get("tool_id");
    if (toolId) query = query.eq("tool_id", toolId);

    const status = sp.get("status");
    if (status && status !== "all") query = query.eq("status", status);

    const location = sp.get("location");
    if (location) query = query.ilike("location", `%${location}%`);

    const search = sp.get("search");
    if (search) {
      query = query.or(
        `code.ilike.%${search}%,patrimony_code.ilike.%${search}%,serial_number.ilike.%${search}%`
      );
    }

    const availableFor = sp.get("available_for");
    if (availableFor) {
      query = query
        .eq("status", "available")
        .or(`reserved_for_request_id.is.null,reserved_for_request_id.eq.${availableFor}`);
    }

    const { data, error, count } = await query
      .order("code", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch tool units: ${error.message}`);

    return jsonResponse({
      data: data ?? [],
      meta: {
        total: count ?? 0,
        page,
        limit,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/tools/units
 * Cadastra uma unidade física. O banco garante unicidade de código,
 * patrimônio e número de série (spec seção 10) — traduzimos a violação
 * para uma mensagem que o operador entenda.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "almoxarifado"]);

    const body = await request.json();
    if (!body?.tool_id || !body?.code) {
      throw new AuthError(400, "tool_id e code são obrigatórios");
    }

    const supabase = getAdminClient();

    const { data: tool } = await supabase
      .from("tool_inventory")
      .select("id, name, tracking_mode")
      .eq("id", body.tool_id)
      .maybeSingle();
    if (!tool) throw new AuthError(400, "Tipo de ferramenta não encontrado");

    const { data, error } = await supabase
      .from("tool_units")
      .insert({
        tool_id: body.tool_id,
        code: String(body.code).trim(),
        patrimony_code: body.patrimony_code?.trim() || null,
        serial_number: body.serial_number?.trim() || null,
        status: body.status || "available",
        condition: body.condition || "good",
        location: body.location || null,
        supplier: body.supplier || null,
        acquired_at: body.acquired_at || null,
        acquisition_value: body.acquisition_value ?? null,
        photos: Array.isArray(body.photos) ? body.photos : [],
        notes: body.notes || null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AuthError(
          409,
          "Já existe uma unidade com esse código, patrimônio ou número de série."
        );
      }
      throw new Error(error.message);
    }

    // Se o tipo ainda estava no modo quantidade, cadastrar unidade o promove.
    if ((tool as { tracking_mode?: string }).tracking_mode !== "controlled") {
      await supabase
        .from("tool_inventory")
        .update({ tracking_mode: "controlled" })
        .eq("id", body.tool_id);
    }

    await recordToolEvent(supabase, {
      tool_id: body.tool_id,
      unit_id: data.id,
      event_type: "cadastro",
      description: `Unidade ${data.code} cadastrada`,
      status_to: data.status,
      actor_id: user.id,
      almoxarife_id: user.id,
    });

    logAudit({
      userId: user.id,
      action: "tool_unit.created",
      entityType: "tool_unit",
      entityId: data.id,
      newData: data as Record<string, unknown>,
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
