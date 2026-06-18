import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

interface ItemPayload {
  id?: string;
  step_key?: string;
  name: string;
  description?: string | null;
  order_index: number;
  photos_required_min?: number;
  final_photos_required_min?: number;
  occurrence_enabled?: boolean;
  is_required?: boolean;
  wait_time_minutes?: number;
}

function slugifyKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "STEP";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("step_template_groups")
      .select(
        `
        *,
        items:step_template_items(*)
      `
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new AuthError(404, "Template não encontrado");
    }

    const normalized = {
      ...data,
      items: (data.items || []).slice().sort(
        (a: { order_index: number }, b: { order_index: number }) =>
          a.order_index - b.order_index
      ),
    };
    return jsonResponse(normalized);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/step-templates/[id]
 * Atualiza nome/descrição/ativo. Se body.items for enviado, sincroniza
 * a lista inteira (cria novos / atualiza existentes / remove os ausentes).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json();

    const supabase = getAdminClient();

    const updatePayload: Record<string, unknown> = {};
    if (body.name !== undefined) updatePayload.name = String(body.name).trim();
    if (body.description !== undefined) updatePayload.description = body.description?.trim() || null;
    if (body.is_active !== undefined) updatePayload.is_active = !!body.is_active;

    if (Object.keys(updatePayload).length > 0) {
      const { error: gErr } = await supabase
        .from("step_template_groups")
        .update(updatePayload)
        .eq("id", id);
      if (gErr) {
        if (gErr.code === "23505") {
          throw new AuthError(409, "Já existe um template com esse nome");
        }
        throw new Error("Falha ao atualizar template");
      }
    }

    if (Array.isArray(body.items)) {
      const incoming: ItemPayload[] = body.items;

      // Estratégia: deletar todos e reinserir (evita conflito de unique order_index ao reordenar).
      // Como os_step_executions têm template_item_id como FK NULLABLE sem ON DELETE CASCADE,
      // o delete falharia se houver execuções referenciando. Por isso só fazemos delete-and-insert
      // se nao houver execuções já criadas a partir desses items.
      const { data: existingItems } = await supabase
        .from("step_template_items")
        .select("id")
        .eq("group_id", id);

      const existingIds = (existingItems || []).map((it: { id: string }) => it.id);

      if (existingIds.length > 0) {
        const { count } = await supabase
          .from("os_step_executions")
          .select("id", { count: "exact", head: true })
          .in("template_item_id", existingIds);

        if (count && count > 0) {
          throw new AuthError(
            409,
            "Não é possível reorganizar etapas porque já há OS em execução usando este template."
          );
        }
      }

      // Apaga e recria
      await supabase.from("step_template_items").delete().eq("group_id", id);

      const usedKeys = new Set<string>();
      const rows = incoming.map((it, idx) => {
        let key = (it.step_key || slugifyKey(it.name)).toUpperCase();
        let candidate = key;
        let n = 2;
        while (usedKeys.has(candidate)) {
          candidate = `${key}_${n++}`;
        }
        usedKeys.add(candidate);
        return {
          group_id: id,
          step_key: candidate,
          name: it.name.trim(),
          description: it.description?.trim() || null,
          order_index: it.order_index ?? idx + 1,
          photos_required_min: it.photos_required_min ?? 1,
          final_photos_required_min: it.final_photos_required_min ?? 1,
          occurrence_enabled: it.occurrence_enabled ?? true,
          is_required: it.is_required ?? true,
          wait_time_minutes: Math.max(
            0,
            Math.min(1440, Math.round(Number(it.wait_time_minutes ?? 0)))
          ),
        };
      });

      if (rows.length > 0) {
        const { error: iErr } = await supabase
          .from("step_template_items")
          .insert(rows);
        if (iErr) {
          throw new Error("Falha ao salvar etapas do template");
        }
      }
    }

    const { data: updated } = await supabase
      .from("step_template_groups")
      .select(`*, items:step_template_items(*)`)
      .eq("id", id)
      .single();

    logAudit({
      userId: user.id,
      action: "step_template_group.updated",
      entityType: "step_template_group",
      entityId: id,
      newData: updatePayload,
    });

    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/step-templates/[id]
 * Soft-delete: marca is_active=false. Templates referenciados por OS continuam funcionando.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { error } = await supabase
      .from("step_template_groups")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      throw new Error("Falha ao desativar template");
    }

    logAudit({
      userId: user.id,
      action: "step_template_group.deactivated",
      entityType: "step_template_group",
      entityId: id,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
