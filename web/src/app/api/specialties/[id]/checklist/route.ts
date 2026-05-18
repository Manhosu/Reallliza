import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

interface IncomingItem {
  id?: string;
  label: string;
  weight?: number;
  order_index?: number;
}

/**
 * GET /api/specialties/[id]/checklist
 * Itens de checklist ativos da especialidade.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("specialty_checklist_items")
      .select("*")
      .eq("specialty_id", id)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (error) {
      throw new Error("Falha ao carregar o checklist");
    }
    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/specialties/[id]/checklist
 * Sincroniza o checklist da especialidade. Apenas admin.
 * Body: { items: [{ id?, label, weight?, order_index? }] }
 * Itens com id são atualizados, sem id são criados; itens ativos
 * ausentes do payload são desativados (soft-delete) — preservando
 * a referência de avaliações de qualidade já feitas.
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
    if (!Array.isArray(body.items)) {
      throw new AuthError(400, "items deve ser uma lista");
    }
    const incoming: IncomingItem[] = body.items;

    const supabase = getAdminClient();

    const { data: existing } = await supabase
      .from("specialty_checklist_items")
      .select("id")
      .eq("specialty_id", id)
      .eq("is_active", true);

    const existingIds = new Set((existing || []).map((it) => it.id));
    const keptIds = new Set<string>();

    for (let i = 0; i < incoming.length; i++) {
      const it = incoming[i];
      const label = String(it.label || "").trim();
      if (!label) continue;
      const row = {
        label,
        weight: Math.max(1, Number(it.weight) || 1),
        order_index: it.order_index ?? i + 1,
        is_active: true,
      };

      if (it.id && existingIds.has(it.id)) {
        keptIds.add(it.id);
        const { error } = await supabase
          .from("specialty_checklist_items")
          .update(row)
          .eq("id", it.id);
        if (error) throw new Error("Falha ao atualizar item do checklist");
      } else {
        const { error } = await supabase
          .from("specialty_checklist_items")
          .insert({ specialty_id: id, ...row });
        if (error) throw new Error("Falha ao criar item do checklist");
      }
    }

    // Desativa os itens ativos que sumiram do payload.
    const toDeactivate = [...existingIds].filter((x) => !keptIds.has(x));
    if (toDeactivate.length > 0) {
      await supabase
        .from("specialty_checklist_items")
        .update({ is_active: false })
        .in("id", toDeactivate);
    }

    const { data: updated } = await supabase
      .from("specialty_checklist_items")
      .select("*")
      .eq("specialty_id", id)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    logAudit({
      userId: user.id,
      action: "specialty_checklist.updated",
      entityType: "specialty",
      entityId: id,
      newData: { items_count: updated?.length || 0 },
    });

    return jsonResponse(updated || []);
  } catch (error) {
    return errorResponse(error);
  }
}
