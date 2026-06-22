import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * POST /api/course-lessons/[id]/complete
 * Marca aula como concluida pelo user logado. Recalcula progress_pct
 * do enrollment + dispara certificado se atingir required_completion_pct
 * e o curso tiver emit_certificate=true.
 *
 * Body: { watched_seconds?, quiz_score? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id: lessonId } = await params;
    const body = await request.json().catch(() => ({}));

    const supabase = getAdminClient();

    // 1. Acha lesson + module + course
    const { data: lesson } = await supabase
      .from("course_lessons")
      .select("id, module_id, module:course_modules(course_id)")
      .eq("id", lessonId)
      .single();
    if (!lesson) throw new AuthError(404, "Aula nao encontrada");

    const moduleData = (lesson as { module: { course_id: string } | { course_id: string }[] }).module;
    const courseId = Array.isArray(moduleData) ? moduleData[0]?.course_id : moduleData?.course_id;
    if (!courseId) throw new AuthError(500, "Curso nao localizado");

    // 2. Garante enrollment (auto-enroll se ainda nao matriculado)
    let { data: enrollment } = await supabase
      .from("course_enrollments")
      .select("*")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle();

    if (!enrollment) {
      const { data: created } = await supabase
        .from("course_enrollments")
        .insert({ course_id: courseId, user_id: user.id, status: "in_progress" })
        .select()
        .single();
      enrollment = created;
    }

    if (!enrollment) throw new AuthError(500, "Falha ao criar matricula");
    const enr = enrollment as { id: string; status: string };

    // 3. Upsert lesson_progress
    const now = new Date().toISOString();
    const progressUpdate: Record<string, unknown> = {
      enrollment_id: enr.id,
      lesson_id: lessonId,
      user_id: user.id,
      completed_at: now,
      updated_at: now,
    };
    if (typeof body.watched_seconds === "number") {
      progressUpdate.watched_seconds = body.watched_seconds;
    }
    if (typeof body.quiz_score === "number") {
      progressUpdate.quiz_score = Math.max(0, Math.min(100, body.quiz_score));
    }

    // Tenta UPDATE primeiro, se nao existe faz INSERT
    const { data: existing } = await supabase
      .from("lesson_progress")
      .select("id, attempts")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("lesson_progress")
        .update({
          ...progressUpdate,
          attempts: ((existing as { attempts: number }).attempts ?? 0) + 1,
        })
        .eq("id", (existing as { id: string }).id);
    } else {
      await supabase
        .from("lesson_progress")
        .insert({ ...progressUpdate, attempts: 1 });
    }

    // 4. Recalcula progress_pct do enrollment
    const { data: allLessons } = await supabase
      .from("course_lessons")
      .select("id, module:course_modules!inner(course_id)")
      .eq("module.course_id", courseId)
      .eq("is_published", true)
      .eq("is_required", true);

    const lessonIds = ((allLessons as Array<{ id: string }> | null) ?? []).map((l) => l.id);
    const total = lessonIds.length;

    let completed = 0;
    if (total > 0) {
      const { count } = await supabase
        .from("lesson_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("lesson_id", lessonIds)
        .not("completed_at", "is", null);
      completed = count ?? 0;
    }

    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    // 5. Carrega config do curso pra ver se completa
    const { data: course } = await supabase
      .from("courses")
      .select("required_completion_pct, emit_certificate, title")
      .eq("id", courseId)
      .single();

    const c = course as {
      required_completion_pct: number;
      emit_certificate: boolean;
      title: string;
    };

    const isCompleted = pct >= c.required_completion_pct;
    const updateEnr: Record<string, unknown> = {
      progress_pct: pct,
      last_activity_at: now,
    };
    if (isCompleted && enr.status !== "completed") {
      updateEnr.status = "completed";
      updateEnr.completed_at = now;
      if (c.emit_certificate) {
        // Gera codigo simples; PDF e emitido sob demanda em /certificate
        updateEnr.certificate_code = `CERT-${courseId.slice(0, 8).toUpperCase()}-${user.id.slice(0, 6).toUpperCase()}`;
        updateEnr.certificate_issued_at = now;
      }
    }

    const { data: updatedEnr } = await supabase
      .from("course_enrollments")
      .update(updateEnr)
      .eq("id", enr.id)
      .select()
      .single();

    return jsonResponse({
      success: true,
      lesson_id: lessonId,
      progress_pct: pct,
      completed: isCompleted,
      enrollment: updatedEnr,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
