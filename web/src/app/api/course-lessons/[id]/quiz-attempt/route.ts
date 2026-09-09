import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { hasAccessToCourse } from "@/lib/courses/access";
import { completeLesson } from "@/lib/courses/complete-lesson";

interface QuizQuestion {
  id: string;
  text: string;
  type: "multiple_choice" | "true_false";
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
}

/**
 * POST /api/course-lessons/[id]/quiz-attempt
 * Responde o quiz de uma aula. Só aceita se todo o resto do conteúdo
 * obrigatório do curso já estiver concluído (regra pedida por Jéssica:
 * avaliação só libera com 100% do conteúdo) e se ainda houver tentativas
 * disponíveis. Se aprovado, conclui a aula (mesma lógica de .../complete).
 *
 * Body: { answers: { [questionId]: selectedOptionId } }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id: lessonId } = await params;
    const body = await request.json().catch(() => ({}));
    const answers = (body.answers ?? {}) as Record<string, string>;

    const supabase = getAdminClient();

    const { data: lesson } = await supabase
      .from("course_lessons")
      .select(
        "id, lesson_type, quiz_questions, min_passing_score, max_attempts, is_required, is_published, module:course_modules(course_id)"
      )
      .eq("id", lessonId)
      .single();
    if (!lesson) throw new AuthError(404, "Aula não encontrada");

    const l = lesson as {
      lesson_type: string;
      quiz_questions: QuizQuestion[] | null;
      min_passing_score: number | null;
      max_attempts: number | null;
      module: { course_id: string } | { course_id: string }[];
    };
    if (l.lesson_type !== "quiz") throw new AuthError(400, "Esta aula não é um quiz");

    const questions = l.quiz_questions ?? [];
    if (questions.length === 0) throw new AuthError(400, "Este quiz ainda não tem perguntas");

    const courseId = Array.isArray(l.module) ? l.module[0]?.course_id : l.module?.course_id;
    if (!courseId) throw new AuthError(500, "Curso não localizado");

    const { data: courseRow } = await supabase
      .from("courses")
      .select("id, price_cents")
      .eq("id", courseId)
      .single();
    if (
      courseRow &&
      !(await hasAccessToCourse(supabase, user.id, courseRow as { id: string; price_cents: number | null }))
    ) {
      throw new AuthError(403, "Este curso exige compra ou liberação de acesso");
    }

    // Regra: só libera a prova com o resto do conteúdo obrigatório 100%
    // concluído (Jéssica, feedback do Módulo de Cursos).
    const { data: otherRequired } = await supabase
      .from("course_lessons")
      .select("id, module:course_modules!inner(course_id)")
      .eq("module.course_id", courseId)
      .eq("is_published", true)
      .eq("is_required", true)
      .neq("id", lessonId);

    const otherIds = ((otherRequired as Array<{ id: string }> | null) ?? []).map((r) => r.id);
    if (otherIds.length > 0) {
      const { count: doneCount } = await supabase
        .from("lesson_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("lesson_id", otherIds)
        .not("completed_at", "is", null);
      if ((doneCount ?? 0) < otherIds.length) {
        throw new AuthError(
          403,
          "Conclua todo o restante do conteúdo do curso antes de fazer a avaliação"
        );
      }
    }

    const { data: previousAttempts } = await supabase
      .from("quiz_attempts")
      .select("id, passed")
      .eq("lesson_id", lessonId)
      .eq("user_id", user.id)
      .order("attempt_number", { ascending: true });

    const attempts = previousAttempts ?? [];
    const alreadyPassed = attempts.some((a) => a.passed);
    if (
      !alreadyPassed &&
      l.max_attempts !== null &&
      attempts.length >= l.max_attempts
    ) {
      throw new AuthError(403, "Número máximo de tentativas atingido");
    }

    let correct = 0;
    for (const q of questions) {
      if (answers[q.id] === q.correct_option_id) correct += 1;
    }
    const score = Math.round((correct / questions.length) * 100);
    const passed = l.min_passing_score == null ? true : score >= l.min_passing_score;
    const attemptNumber = attempts.length + 1;

    await supabase.from("quiz_attempts").insert({
      lesson_id: lessonId,
      user_id: user.id,
      answers,
      score,
      passed,
      attempt_number: attemptNumber,
    });

    let completionResult: Awaited<ReturnType<typeof completeLesson>> | null = null;
    if (passed) {
      completionResult = await completeLesson(supabase, user.id, lessonId, { quiz_score: score });
    } else if (l.max_attempts !== null && attemptNumber >= l.max_attempts) {
      // Esgotou as tentativas sem aprovar — reprovado de verdade, aparece
      // no painel de analytics (matriculados/aprovados/reprovados).
      await supabase
        .from("course_enrollments")
        .update({ status: "failed", last_activity_at: new Date().toISOString() })
        .eq("course_id", courseId)
        .eq("user_id", user.id)
        .neq("status", "completed");
    }

    return jsonResponse({
      score,
      passed,
      attempt_number: attemptNumber,
      attempts_remaining:
        l.max_attempts == null ? null : Math.max(0, l.max_attempts - attemptNumber),
      progress_pct: completionResult?.progress_pct ?? null,
      completed: completionResult?.completed ?? false,
      enrollment: completionResult?.enrollment ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
