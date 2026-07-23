import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/teams/[id]/members
 * Body: { technician_id, is_leader? }
 * Adiciona tecnico a equipe (admin only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id: teamId } = await params;
    const body = await request.json();
    const { technician_id, is_leader } = body as {
      technician_id?: string;
      is_leader?: boolean;
    };
    if (!technician_id) return errorResponse(new Error("technician_id obrigatorio"));

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("team_members")
      .upsert(
        {
          team_id: teamId,
          technician_id,
          is_leader: is_leader ?? false,
        },
        { onConflict: "team_id,technician_id" }
      )
      .select("*")
      .single();
    if (error) throw error;

    logAudit({
      userId: user.id,
      action: "team.member_added",
      entityType: "team",
      entityId: teamId,
      newData: { technician_id, is_leader: is_leader ?? false },
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/teams/[id]/members?technician_id=xxx
 * Remove tecnico da equipe (admin only).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id: teamId } = await params;
    const technicianId = request.nextUrl.searchParams.get("technician_id");
    if (!technicianId)
      return errorResponse(new Error("technician_id obrigatorio"));

    const supabase = getAdminClient();
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("technician_id", technicianId);
    if (error) throw error;

    logAudit({
      userId: user.id,
      action: "team.member_removed",
      entityType: "team",
      entityId: teamId,
      newData: { technician_id: technicianId },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
