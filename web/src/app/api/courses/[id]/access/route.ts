import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/courses/[id]/access — lista quem tem acesso liberado
 * manualmente (por usuário ou por equipe) a um curso pago. Admin only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const [{ data: users, error: usersErr }, { data: teams, error: teamsErr }] =
      await Promise.all([
        supabase
          .from("course_access_grants")
          .select("user_id, granted_at, granted_by, profile:profiles!course_access_grants_user_id_fkey(id, full_name, email)")
          .eq("course_id", id)
          .order("granted_at", { ascending: false }),
        supabase
          .from("course_team_access")
          .select("team_id, team:teams(id, name, color)")
          .eq("course_id", id),
      ]);

    if (usersErr || teamsErr) throw new Error("Falha ao carregar acessos");

    return jsonResponse({ users: users ?? [], teams: teams ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/courses/[id]/access — libera acesso manual.
 * Body: { user_id } ou { team_id }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const body = await request.json();
    const supabase = getAdminClient();

    const { data: course } = await supabase
      .from("courses")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!course) throw new AuthError(404, "Curso não encontrado");

    if (body.user_id) {
      const { error } = await supabase
        .from("course_access_grants")
        .upsert(
          { course_id: id, user_id: body.user_id, granted_by: user.id },
          { onConflict: "course_id,user_id" }
        );
      if (error) throw new Error("Falha ao liberar acesso");

      logAudit({
        userId: user.id,
        action: "course.access_granted",
        entityType: "course",
        entityId: id,
        newData: { user_id: body.user_id },
      });
      return jsonResponse({ success: true }, 201);
    }

    if (body.team_id) {
      const { error } = await supabase
        .from("course_team_access")
        .upsert(
          { course_id: id, team_id: body.team_id },
          { onConflict: "course_id,team_id" }
        );
      if (error) throw new Error("Falha ao liberar acesso da equipe");

      logAudit({
        userId: user.id,
        action: "course.team_access_granted",
        entityType: "course",
        entityId: id,
        newData: { team_id: body.team_id },
      });
      return jsonResponse({ success: true }, 201);
    }

    throw new AuthError(400, "Informe user_id ou team_id");
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/courses/[id]/access?user_id=... ou ?team_id=... — revoga.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const userId = request.nextUrl.searchParams.get("user_id");
    const teamId = request.nextUrl.searchParams.get("team_id");
    const supabase = getAdminClient();

    if (userId) {
      await supabase
        .from("course_access_grants")
        .delete()
        .eq("course_id", id)
        .eq("user_id", userId);
      logAudit({
        userId: user.id,
        action: "course.access_revoked",
        entityType: "course",
        entityId: id,
        newData: { user_id: userId },
      });
      return jsonResponse({ success: true });
    }

    if (teamId) {
      await supabase
        .from("course_team_access")
        .delete()
        .eq("course_id", id)
        .eq("team_id", teamId);
      logAudit({
        userId: user.id,
        action: "course.team_access_revoked",
        entityType: "course",
        entityId: id,
        newData: { team_id: teamId },
      });
      return jsonResponse({ success: true });
    }

    throw new AuthError(400, "Informe user_id ou team_id");
  } catch (error) {
    return errorResponse(error);
  }
}
