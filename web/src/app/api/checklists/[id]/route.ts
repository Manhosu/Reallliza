import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/checklists/[id]
 * Get a single checklist by ID with its items, template info, and completed_by user.
 * Authenticated users.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: checklist, error } = await supabase
      .from("checklists")
      .select(
        `
        *,
        template:checklist_templates(id, name, description),
        technician:profiles!checklists_technician_id_fkey(id, full_name)
      `
      )
      .eq("id", id)
      .single();

    if (error || !checklist) {
      throw new AuthError(404, `Checklist with ID ${id} not found`);
    }

    return jsonResponse({
      ...checklist,
      items: (checklist as { data?: unknown[] }).data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/checklists/[id]
 * Atualiza o array de itens (data) do checklist. Se `completed=true` no body,
 * marca o checklist como concluído no mesmo update.
 *
 * Body: { items?: array, completed?: boolean, version?: number }
 *  - `items` substitui o JSON `data` do checklist.
 *  - `completed=true` seta is_completed/completed_at agora.
 *  - `version` habilita optimistic locking (responde 409 em divergência).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : undefined;
    const completed = body.completed === true;
    const version: number | undefined =
      typeof body.version === "number" ? body.version : undefined;

    const supabase = getAdminClient();

    const { data: existing, error: findError } = await supabase
      .from("checklists")
      .select("id, service_order_id, is_completed, completed_at")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      throw new AuthError(404, `Checklist with ID ${id} not found`);
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (items !== undefined) {
      updateData.data = items;
    }

    if (completed && !existing.is_completed) {
      updateData.is_completed = true;
      updateData.completed_at = new Date().toISOString();
    }

    let updateQuery = supabase
      .from("checklists")
      .update(updateData)
      .eq("id", id);

    if (version !== undefined) {
      updateQuery = updateQuery.eq("version", version);
    }

    const { data: updated, error: updateError } = await updateQuery
      .select()
      .single();

    if (updateError) {
      if (version !== undefined && updateError.code === "PGRST116") {
        return jsonResponse(
          {
            message:
              "Dados desatualizados. Recarregue a página e tente novamente.",
          },
          409
        );
      }
      console.error(`Failed to update checklist ${id}:`, updateError);
      throw new AuthError(500, "Falha ao atualizar checklist");
    }

    if (updateData.is_completed) {
      logAudit({
        userId: user.id,
        action: "checklist.completed",
        entityType: "checklist",
        entityId: id,
        newData: { completed_at: updateData.completed_at },
      });
    } else if (items !== undefined) {
      logAudit({
        userId: user.id,
        action: "checklist.updated",
        entityType: "checklist",
        entityId: id,
        newData: { items_count: items.length },
      });
    }

    return jsonResponse({
      ...updated,
      items: (updated as { data?: unknown[] }).data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
