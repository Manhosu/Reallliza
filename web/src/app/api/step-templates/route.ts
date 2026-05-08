import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

interface IncomingItem {
  step_key?: string;
  name: string;
  description?: string | null;
  order_index: number;
  photos_required_min?: number;
  final_photos_required_min?: number;
  occurrence_enabled?: boolean;
  is_required?: boolean;
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

/**
 * GET /api/step-templates
 * Lista grupos de templates de etapas com a contagem de itens.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const includeInactive = searchParams.get("include_inactive") === "true";
    const search = searchParams.get("search");

    const supabase = getAdminClient();

    let query = supabase
      .from("step_template_groups")
      .select(
        `
        *,
        items:step_template_items(id, step_key, name, description, order_index, photos_required_min, final_photos_required_min, occurrence_enabled, is_required)
      `
      )
      .order("created_at", { ascending: false });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to list step template groups: ${error.message}`);
      throw new Error("Failed to list step template groups");
    }

    const normalized = (data || []).map((g: { items?: IncomingItem[] }) => ({
      ...g,
      items: (g.items || []).slice().sort(
        (a: IncomingItem, b: IncomingItem) => a.order_index - b.order_index
      ),
    }));

    return jsonResponse(normalized);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/step-templates
 * Cria um grupo (template nomeado) com seus itens em uma única chamada.
 * Body: { name, description?, is_active?, items: [{ name, description?, order_index, photos_required_min, final_photos_required_min, occurrence_enabled, is_required, step_key? }] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      throw new AuthError(400, "Nome do template é obrigatório");
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new AuthError(400, "Adicione ao menos uma etapa");
    }

    const supabase = getAdminClient();

    const { data: group, error: gErr } = await supabase
      .from("step_template_groups")
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        is_active: body.is_active !== undefined ? !!body.is_active : true,
        created_by: user.id,
      })
      .select()
      .single();

    if (gErr) {
      if (gErr.code === "23505") {
        throw new AuthError(409, "Já existe um template com esse nome");
      }
      console.error(`Failed to create group: ${gErr.message}`);
      throw new Error("Falha ao criar template");
    }

    const incoming: IncomingItem[] = body.items;
    const usedKeys = new Set<string>();
    const itemsRows = incoming.map((it, idx) => {
      let key = (it.step_key || slugifyKey(it.name)).toUpperCase();
      let candidate = key;
      let n = 2;
      while (usedKeys.has(candidate)) {
        candidate = `${key}_${n++}`;
      }
      usedKeys.add(candidate);
      return {
        group_id: group.id,
        step_key: candidate,
        name: it.name.trim(),
        description: it.description?.trim() || null,
        order_index: it.order_index ?? idx + 1,
        photos_required_min: it.photos_required_min ?? 1,
        final_photos_required_min: it.final_photos_required_min ?? 1,
        occurrence_enabled: it.occurrence_enabled ?? true,
        is_required: it.is_required ?? true,
      };
    });

    const { data: items, error: iErr } = await supabase
      .from("step_template_items")
      .insert(itemsRows)
      .select();

    if (iErr) {
      // Rollback do grupo se itens falharem
      await supabase.from("step_template_groups").delete().eq("id", group.id);
      console.error(`Failed to insert items: ${iErr.message}`);
      throw new Error("Falha ao criar etapas do template");
    }

    logAudit({
      userId: user.id,
      action: "step_template_group.created",
      entityType: "step_template_group",
      entityId: group.id,
      newData: { name: group.name, items_count: items?.length || 0 },
    });

    return jsonResponse({ ...group, items }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
