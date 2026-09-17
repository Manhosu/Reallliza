import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuizStatus {
  attempts_used: number;
  passed: boolean;
  /** Esgotou as tentativas normais sem ser aprovado. */
  exhausted: boolean;
  /** Já tem um reteste pago e ainda não usado — a próxima tentativa é liberada. */
  retest_unlocked: boolean;
}

/**
 * Estado das tentativas de um aluno numa aula de quiz — usado tanto pra
 * exibir (GET /courses/[id]) quanto pra decidir se libera uma nova
 * tentativa (POST quiz-attempt e POST retest-purchase). Extraído pra um
 * lugar só depois que o reteste pago (Jéssica, 17/09) precisou da mesma
 * conta de "esgotou tentativas" em dois lugares — divergir os dois seria
 * pior que duplicar a query.
 */
export async function getQuizStatus(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  maxAttempts: number | null
): Promise<QuizStatus> {
  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("passed")
    .eq("lesson_id", lessonId)
    .eq("user_id", userId);

  const rows = attempts ?? [];
  const passed = rows.some((a) => a.passed);
  const exhausted = !passed && maxAttempts != null && rows.length >= maxAttempts;

  let retestUnlocked = false;
  if (exhausted) {
    const { data: retest } = await supabase
      .from("quiz_retest_purchases")
      .select("id")
      .eq("lesson_id", lessonId)
      .eq("user_id", userId)
      .eq("status", "paid")
      .limit(1)
      .maybeSingle();
    retestUnlocked = !!retest;
  }

  return { attempts_used: rows.length, passed, exhausted, retest_unlocked: retestUnlocked };
}
