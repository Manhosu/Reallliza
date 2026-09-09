import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Marca uma aula como concluída pro usuário, recalcula o progresso do
 * enrollment e emite certificado se bater o required_completion_pct.
 * Extraído de POST /course-lessons/[id]/complete pra ser chamado também
 * pelo quiz (POST /course-lessons/[id]/quiz-attempt quando aprovado) sem
 * duplicar a regra de progresso/certificado.
 */
export async function completeLesson(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  opts?: { watched_seconds?: number; quiz_score?: number }
): Promise<{
  progress_pct: number;
  completed: boolean;
  enrollment: Record<string, unknown> | null;
}> {
  const { data: lesson } = await supabase
    .from("course_lessons")
    .select("id, module_id, module:course_modules(course_id)")
    .eq("id", lessonId)
    .single();
  if (!lesson) throw new Error("Aula não encontrada");

  const moduleData = (lesson as { module: { course_id: string } | { course_id: string }[] })
    .module;
  const courseId = Array.isArray(moduleData) ? moduleData[0]?.course_id : moduleData?.course_id;
  if (!courseId) throw new Error("Curso não localizado");

  let { data: enrollment } = await supabase
    .from("course_enrollments")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!enrollment) {
    const { data: created } = await supabase
      .from("course_enrollments")
      .insert({ course_id: courseId, user_id: userId, status: "in_progress" })
      .select()
      .single();
    enrollment = created;
  }
  if (!enrollment) throw new Error("Falha ao criar matrícula");
  const enr = enrollment as { id: string; status: string };

  const now = new Date().toISOString();
  const progressUpdate: Record<string, unknown> = {
    enrollment_id: enr.id,
    lesson_id: lessonId,
    user_id: userId,
    completed_at: now,
    updated_at: now,
  };
  if (typeof opts?.watched_seconds === "number") {
    progressUpdate.watched_seconds = opts.watched_seconds;
  }
  if (typeof opts?.quiz_score === "number") {
    progressUpdate.quiz_score = Math.max(0, Math.min(100, opts.quiz_score));
  }

  const { data: existing } = await supabase
    .from("lesson_progress")
    .select("id, attempts")
    .eq("user_id", userId)
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
    await supabase.from("lesson_progress").insert({ ...progressUpdate, attempts: 1 });
  }

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
      .eq("user_id", userId)
      .in("lesson_id", lessonIds)
      .not("completed_at", "is", null);
    completed = count ?? 0;
  }

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

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
      updateEnr.certificate_code = `CERT-${courseId.slice(0, 8).toUpperCase()}-${userId
        .slice(0, 6)
        .toUpperCase()}`;
      updateEnr.certificate_issued_at = now;
    }
  }

  const { data: updatedEnr } = await supabase
    .from("course_enrollments")
    .update(updateEnr)
    .eq("id", enr.id)
    .select()
    .single();

  return { progress_pct: pct, completed: isCompleted, enrollment: updatedEnr ?? null };
}
