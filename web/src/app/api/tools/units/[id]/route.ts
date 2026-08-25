import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { recordToolCorrection } from "@/lib/tools/events";

/**
 * GET /api/tools/units/[id]
 * Ficha da unidade física com o que a seção 7 da spec pede: situação,
 * localização, técnico atual, OS atual, última movimentação e os contadores
 * de vida útil (seção 26).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: unit, error } = await supabase
      .from("tool_units")
      .select(
        `*, tool:tool_inventory(id, name, category, brand, model, description, tracking_mode)`
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !unit) throw new AuthError(404, "Unidade não encontrada");

    // Custódia ativa (quem está com ela agora)
    const { data: custody } = await supabase
      .from("tool_custody")
      .select(
        `id, user_id, checked_out_at, expected_return_at, return_requested_at,
         condition_out, service_order_id,
         user:profiles!tool_custody_user_id_fkey(id, full_name, phone),
         service_order:service_orders(id, order_number, title)`
      )
      .eq("unit_id", id)
      .is("checked_in_at", null)
      .maybeSingle();

    // Resumo de vida útil (seção 26)
    const [{ count: retiradas }, { count: manutencoes }, { count: danos }] =
      await Promise.all([
        supabase
          .from("tool_events")
          .select("*", { count: "exact", head: true })
          .eq("unit_id", id)
          .eq("event_type", "entrega"),
        supabase
          .from("tool_maintenance")
          .select("*", { count: "exact", head: true })
          .eq("unit_id", id),
        supabase
          .from("tool_events")
          .select("*", { count: "exact", head: true })
          .eq("unit_id", id)
          .eq("event_type", "dano"),
      ]);

    const { data: tecnicos } = await supabase
      .from("tool_custody")
      .select("user_id")
      .eq("unit_id", id);

    const { data: ultimoEvento } = await supabase
      .from("tool_events")
      .select("event_type, description, created_at")
      .eq("unit_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: custoManutencao } = await supabase
      .from("tool_maintenance")
      .select("final_cost")
      .eq("unit_id", id);

    return jsonResponse({
      ...unit,
      current_custody: custody ?? null,
      summary: {
        total_checkouts: retiradas ?? 0,
        total_maintenances: manutencoes ?? 0,
        total_damages: danos ?? 0,
        distinct_technicians: new Set(
          ((tecnicos ?? []) as Array<{ user_id: string }>).map((t) => t.user_id)
        ).size,
        maintenance_cost: ((custoManutencao ?? []) as Array<{ final_cost: number | null }>)
          .reduce((sum, m) => sum + (Number(m.final_cost) || 0), 0),
        last_event: ultimoEvento ?? null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/tools/units/[id]
 * Edita o cadastro da unidade. Toda alteração vira evento de correção no
 * histórico (spec seção 10: "toda alteração cadastral deverá gerar registro
 * no histórico da ferramenta").
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "almoxarifado"]);
    const { id } = await params;
    const body = await request.json();

    const supabase = getAdminClient();

    const { data: before } = await supabase
      .from("tool_units")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!before) throw new AuthError(404, "Unidade não encontrada");

    const EDITABLE = [
      "code",
      "patrimony_code",
      "serial_number",
      "condition",
      "location",
      "supplier",
      "acquired_at",
      "acquisition_value",
      "photos",
      "notes",
    ] as const;

    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE) {
      if (body[field] !== undefined) patch[field] = body[field];
    }
    if (Object.keys(patch).length === 0) {
      throw new AuthError(400, "Nada para atualizar");
    }

    const { data, error } = await supabase
      .from("tool_units")
      .update(patch)
      .eq("id", id)
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

    const previous = before as Record<string, unknown>;
    for (const [field, value] of Object.entries(patch)) {
      if (JSON.stringify(previous[field]) === JSON.stringify(value)) continue;
      await recordToolCorrection(supabase, {
        tool_id: data.tool_id,
        unit_id: id,
        actor_id: user.id,
        field,
        old_value: previous[field],
        new_value: value,
        reason: typeof body.reason === "string" ? body.reason : undefined,
      });
    }

    logAudit({
      userId: user.id,
      action: "tool_unit.updated",
      entityType: "tool_unit",
      entityId: id,
      oldData: previous,
      newData: data as Record<string, unknown>,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
