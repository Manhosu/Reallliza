import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/teams/[id]
 * Detalhe da equipe com membros e agenda proxima (proximos 30 dias).
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
      .from("teams")
      .select(
        `*,
         members:team_members(technician_id, is_leader, joined_at,
           profile:profiles(id, full_name, email, phone, avatar_url))`
      )
      .eq("id", id)
      .single();
    if (error || !data) throw new AuthError(404, "Equipe nao encontrada");
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/teams/[id]
 * Body: { name?, color?, description?, is_active? }
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
    const update: Record<string, unknown> = {};
    for (const f of ["name", "color", "description", "is_active"] as const) {
      if (f in body) update[f] = body[f];
    }
    update.updated_at = new Date().toISOString();

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("teams")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    logAudit({
      userId: user.id,
      action: "team.updated",
      entityType: "team",
      entityId: id,
      newData: data as Record<string, unknown>,
    });
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/teams/[id]
 * Soft-delete: marca is_active=false. Nao remove pra preservar historico.
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
    const { data, error } = await supabase
      .from("teams")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name")
      .single();
    if (error) throw error;

    logAudit({
      userId: user.id,
      action: "team.deactivated",
      entityType: "team",
      entityId: id,
    });
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
