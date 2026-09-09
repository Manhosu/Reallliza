import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { hasAccessToCourse } from "@/lib/courses/access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("courses")
      .select(
        "*, category:course_categories(id, name, icon), modules:course_modules(*, lessons:course_lessons(*))"
      )
      .eq("id", id)
      .single();

    if (error || !data) throw new AuthError(404, "Curso nao encontrado");

    // Enrollment + progress + acesso do user (nao-admin)
    let extra: Record<string, unknown> = {};
    let responseData: typeof data = data;
    if (user.role !== "admin") {
      const { data: enr } = await supabase
        .from("course_enrollments")
        .select("*")
        .eq("user_id", user.id)
        .eq("course_id", id)
        .maybeSingle();
      const { data: progress } = await supabase
        .from("lesson_progress")
        .select("lesson_id, completed_at, watched_seconds, quiz_score")
        .eq("user_id", user.id);
      const hasAccess = await hasAccessToCourse(supabase, user.id, data as { id: string; price_cents?: number | null });
      extra = { enrollment: enr ?? null, progress: progress ?? [], has_access: hasAccess };

      // Nunca manda o gabarito pro aluno — correct_option_id só existe
      // pro admin, que edita o quiz.
      responseData = {
        ...data,
        modules: (
          data as unknown as {
            modules: Array<{ lessons: Array<Record<string, unknown>> }>;
          }
        ).modules?.map((m) => ({
          ...m,
          lessons: m.lessons?.map((l) => {
            if (!Array.isArray(l.quiz_questions)) return l;
            return {
              ...l,
              quiz_questions: (l.quiz_questions as Array<Record<string, unknown>>).map(
                ({ correct_option_id, ...rest }) => rest
              ),
            };
          }),
        })),
      } as typeof data;
    }

    return jsonResponse({ ...responseData, ...extra });
  } catch (error) {
    return errorResponse(error);
  }
}

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
    if (body.title !== undefined) update.title = String(body.title).slice(0, 200);
    if (body.description !== undefined) update.description = body.description ? String(body.description).slice(0, 2000) : null;
    if (body.thumbnail_url !== undefined) update.thumbnail_url = body.thumbnail_url || null;
    if (body.category_id !== undefined) update.category_id = body.category_id || null;
    if (body.audience !== undefined) update.audience = body.audience;
    if (body.price_cents !== undefined) {
      update.price_cents =
        typeof body.price_cents === "number" && body.price_cents > 0
          ? Math.round(body.price_cents)
          : null;
    }
    if (body.level !== undefined) update.level = body.level || null;
    if (body.workload_hours !== undefined) {
      update.workload_hours = typeof body.workload_hours === "number" ? body.workload_hours : null;
    }
    if (body.order_index !== undefined) update.order_index = body.order_index;
    if (body.is_published !== undefined) update.is_published = !!body.is_published;
    if (body.emit_certificate !== undefined) update.emit_certificate = !!body.emit_certificate;
    if (body.required_completion_pct !== undefined) {
      update.required_completion_pct = Math.max(0, Math.min(100, body.required_completion_pct));
    }

    if (Object.keys(update).length === 0) throw new AuthError(400, "Nada para atualizar");

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("courses")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error("Falha ao atualizar");

    logAudit({
      userId: user.id,
      action: "course.updated",
      entityType: "course",
      entityId: id,
      newData: update,
    });

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();
    await supabase.from("courses").update({ is_published: false }).eq("id", id);
    logAudit({
      userId: user.id,
      action: "course.unpublished",
      entityType: "course",
      entityId: id,
    });
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
