import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { hasAccessToCourse } from "@/lib/courses/access";
import { completeLesson } from "@/lib/courses/complete-lesson";

/**
 * POST /api/course-lessons/[id]/complete
 * Marca aula (vídeo/texto/pdf) como concluída pelo user logado. Aula do
 * tipo quiz não passa por aqui — usa POST .../quiz-attempt, que calcula
 * nota e só chama completeLesson() se aprovado.
 *
 * Body: { watched_seconds? }
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

    const { data: lesson } = await supabase
      .from("course_lessons")
      .select("id, lesson_type, module:course_modules(course_id)")
      .eq("id", lessonId)
      .single();
    if (!lesson) throw new AuthError(404, "Aula não encontrada");
    if ((lesson as { lesson_type: string }).lesson_type === "quiz") {
      throw new AuthError(400, "Aula de quiz é concluída respondendo o quiz");
    }

    const moduleData = (lesson as { module: { course_id: string } | { course_id: string }[] })
      .module;
    const courseId = Array.isArray(moduleData) ? moduleData[0]?.course_id : moduleData?.course_id;
    if (!courseId) throw new AuthError(500, "Curso não localizado");

    const { data: courseAccessRow } = await supabase
      .from("courses")
      .select("id, price_cents")
      .eq("id", courseId)
      .single();
    if (
      courseAccessRow &&
      !(await hasAccessToCourse(supabase, user.id, courseAccessRow as { id: string; price_cents: number | null }))
    ) {
      throw new AuthError(403, "Este curso exige compra ou liberação de acesso");
    }

    const result = await completeLesson(supabase, user.id, lessonId, {
      watched_seconds: typeof body.watched_seconds === "number" ? body.watched_seconds : undefined,
    });

    return jsonResponse({
      success: true,
      lesson_id: lessonId,
      progress_pct: result.progress_pct,
      completed: result.completed,
      enrollment: result.enrollment,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
