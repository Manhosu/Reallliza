"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Video,
  FileText,
  HelpCircle,
  FileType,
  Award,
  PlayCircle,
  Lock,
  Image as ImageIcon,
  Paperclip,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface QuizOption {
  id: string;
  text: string;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: "multiple_choice" | "true_false";
  options: QuizOption[];
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: "video" | "text" | "quiz" | "pdf" | "image" | "attachment";
  video_url: string | null;
  pdf_url: string | null;
  image_url: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  content_md: string | null;
  quiz_questions: QuizQuestion[] | null;
  duration_sec: number | null;
  order_index: number;
  is_required: boolean;
}

interface Module {
  id: string;
  title: string;
  order_index: number;
  lessons: Lesson[];
}

interface ProgressItem {
  lesson_id: string;
  completed_at: string | null;
  watched_seconds: number;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  required_completion_pct: number;
  price_cents: number | null;
  has_access?: boolean;
  modules: Module[];
  enrollment: {
    id: string;
    status: string;
    progress_pct: number;
    certificate_code: string | null;
  } | null;
  progress: ProgressItem[];
}

const TYPE_ICONS: Record<Lesson["lesson_type"], React.ComponentType<{ className?: string }>> = {
  video: Video,
  text: FileText,
  quiz: HelpCircle,
  pdf: FileType,
  image: ImageIcon,
  attachment: Paperclip,
};

export default function AprendizadoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [completing, setCompleting] = useState(false);
  const [buying, setBuying] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<{
    score: number;
    passed: boolean;
    attempts_remaining: number | null;
  } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<Course>(`/courses/${id}`);
      const sortedCourse: Course = {
        ...data,
        modules: (data.modules ?? [])
          .sort((a, b) => a.order_index - b.order_index)
          .map((m) => ({
            ...m,
            lessons: (m.lessons ?? []).sort(
              (a, b) => a.order_index - b.order_index
            ),
          })),
      };
      setCourse(sortedCourse);
      // Auto-enroll — só se já tiver acesso (curso grátis, comprado ou
      // liberado). Curso pago sem acesso mostra a tela de compra em vez
      // de tentar matricular (a rota agora recusa com 403 mesmo).
      if (!data.enrollment && data.has_access !== false) {
        try {
          await apiClient.post(`/courses/${id}/enroll`);
          // Recarrega
          const refreshed = await apiClient.get<Course>(`/courses/${id}`);
          setCourse({
            ...refreshed,
            modules: sortedCourse.modules,
          });
        } catch (err) {
          console.error(err);
        }
      }
      // Define primeira aula nao concluida como ativa
      const firstUncomplete = sortedCourse.modules
        .flatMap((m) => m.lessons)
        .find((l) => {
          const p = data.progress?.find((pp) => pp.lesson_id === l.id);
          return !p?.completed_at;
        });
      setActiveLesson(firstUncomplete ?? sortedCourse.modules[0]?.lessons[0] ?? null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Volta do checkout externo (Asaas abre em outra aba) — re-checa acesso
  // ao focar a janela de novo, mesma ideia do listener de AppState que já
  // existe no app mobile pra este mesmo problema.
  useEffect(() => {
    function onFocus() {
      load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function handlePurchase() {
    setBuying(true);
    try {
      const result = await apiClient.post<{ checkout_url: string | null; manual: boolean }>(
        `/courses/${id}/purchase`
      );
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        toast.success("Compra registrada. Aguarde a liberação do acesso.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar compra");
    } finally {
      setBuying(false);
    }
  }

  function isCompleted(lessonId: string): boolean {
    return !!course?.progress?.find(
      (p) => p.lesson_id === lessonId && p.completed_at
    );
  }

  // Mesma regra do backend (quiz-attempt/route.ts): a prova só libera
  // quando todo o RESTO do conteúdo obrigatório do curso já foi concluído.
  function isQuizUnlocked(lesson: Lesson): boolean {
    if (!course) return false;
    const otherRequired = course.modules
      .flatMap((m) => m.lessons)
      .filter((l) => l.id !== lesson.id && l.is_required);
    return otherRequired.every((l) => isCompleted(l.id));
  }

  function selectLesson(l: Lesson) {
    setActiveLesson(l);
    setQuizAnswers({});
    setQuizResult(null);
  }

  async function handleQuizSubmit() {
    if (!activeLesson) return;
    setQuizSubmitting(true);
    try {
      const result = await apiClient.post<{
        score: number;
        passed: boolean;
        attempts_remaining: number | null;
        completed: boolean;
      }>(`/course-lessons/${activeLesson.id}/quiz-attempt`, { answers: quizAnswers });
      setQuizResult(result);
      if (result.passed) {
        toast.success(`Aprovado com ${result.score}%!`);
        if (result.completed) {
          toast.success("🎉 Curso concluído! Certificado disponível.", { duration: 6000 });
        }
        load();
      } else {
        toast.error(`Reprovado com ${result.score}%.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar respostas");
    } finally {
      setQuizSubmitting(false);
    }
  }

  async function handleComplete() {
    if (!activeLesson) return;
    setCompleting(true);
    try {
      const result = await apiClient.post<{
        completed: boolean;
        progress_pct: number;
      }>(`/course-lessons/${activeLesson.id}/complete`, {
        watched_seconds: activeLesson.duration_sec ?? 0,
      });
      toast.success("Aula concluída!");
      if (result.completed) {
        toast.success("🎉 Curso concluído! Certificado disponível.", {
          duration: 6000,
        });
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setCompleting(false);
    }
  }

  if (isLoading) {
    return <Skeleton className="h-96 rounded-xl" />;
  }
  if (!course) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          Curso não encontrado.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          href="/aprendizado"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Aprendizado
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight lg:text-3xl">
          {course.title}
        </h1>
        {course.description && (
          <p className="text-muted-foreground">{course.description}</p>
        )}
      </motion.div>

      {course.has_access === false ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Lock className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-semibold">Este curso é pago</h2>
              <p className="text-sm text-muted-foreground">
                Compre o acesso para liberar módulos, aulas e certificado.
              </p>
            </div>
            <span className="text-2xl font-bold">
              R$ {((course.price_cents ?? 0) / 100).toFixed(2).replace(".", ",")}
            </span>
            <Button onClick={handlePurchase} isLoading={buying}>
              Comprar acesso
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
      {course.enrollment && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Progresso</span>
              <span className="text-sm font-bold">
                {course.enrollment.progress_pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full transition-all",
                  course.enrollment.status === "completed"
                    ? "bg-green-500"
                    : "bg-primary"
                )}
                style={{ width: `${course.enrollment.progress_pct}%` }}
              />
            </div>
            {course.enrollment.status === "completed" &&
              course.enrollment.certificate_code && (
                <a
                  href={`/api/course-enrollments/${course.enrollment.id}/certificate`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                >
                  <Award className="h-4 w-4" />
                  Baixar certificado
                </a>
              )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Aula ativa */}
        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-4">
            {activeLesson ? (
              <>
                <h2 className="font-semibold">{activeLesson.title}</h2>
                {activeLesson.description && (
                  <p className="text-sm text-muted-foreground">
                    {activeLesson.description}
                  </p>
                )}

                {activeLesson.lesson_type === "video" && activeLesson.video_url && (
                  <video
                    src={activeLesson.video_url}
                    controls
                    className="w-full rounded-lg"
                  />
                )}
                {activeLesson.lesson_type === "pdf" && activeLesson.pdf_url && (
                  <iframe
                    src={activeLesson.pdf_url}
                    className="h-[60vh] w-full rounded-lg border"
                    title={activeLesson.title}
                  />
                )}
                {activeLesson.lesson_type === "text" && activeLesson.content_md && (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <pre className="whitespace-pre-wrap rounded-lg bg-muted/30 p-4 text-sm">
                      {activeLesson.content_md}
                    </pre>
                  </div>
                )}
                {activeLesson.lesson_type === "image" && activeLesson.image_url && (
                  <img
                    src={activeLesson.image_url}
                    alt={activeLesson.title}
                    className="w-full rounded-lg"
                  />
                )}
                {activeLesson.lesson_type === "attachment" && activeLesson.attachment_url && (
                  <a
                    href={activeLesson.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Download className="h-4 w-4" />
                    {activeLesson.attachment_name || "Baixar arquivo"}
                  </a>
                )}
                {activeLesson.lesson_type === "quiz" &&
                  (!isQuizUnlocked(activeLesson) ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                      <Lock className="h-6 w-6" />
                      Conclua todo o restante do conteúdo do curso antes de fazer esta avaliação.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(activeLesson.quiz_questions ?? []).map((q, qIdx) => (
                        <div key={q.id} className="space-y-2 rounded-lg border p-3">
                          <p className="text-sm font-medium">
                            {qIdx + 1}. {q.text}
                          </p>
                          <div className="space-y-1.5 pl-2">
                            {q.options.map((o) => (
                              <label
                                key={o.id}
                                className="flex cursor-pointer items-center gap-2 text-sm"
                              >
                                <input
                                  type="radio"
                                  name={q.id}
                                  checked={quizAnswers[q.id] === o.id}
                                  onChange={() =>
                                    setQuizAnswers((a) => ({ ...a, [q.id]: o.id }))
                                  }
                                  disabled={!!quizResult}
                                />
                                {o.text}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}

                      {quizResult && (
                        <div
                          className={cn(
                            "rounded-lg p-3 text-sm font-medium",
                            quizResult.passed
                              ? "bg-green-500/10 text-green-700 dark:text-green-300"
                              : "bg-destructive/10 text-destructive"
                          )}
                        >
                          {quizResult.passed
                            ? `Aprovado com ${quizResult.score}%!`
                            : `Reprovado com ${quizResult.score}%.` +
                              (quizResult.attempts_remaining === 0
                                ? " Sem mais tentativas."
                                : quizResult.attempts_remaining != null
                                  ? ` Tentativas restantes: ${quizResult.attempts_remaining}.`
                                  : "")}
                        </div>
                      )}

                      {!quizResult?.passed && (
                        <div className="flex justify-end">
                          <Button
                            onClick={handleQuizSubmit}
                            isLoading={quizSubmitting}
                            disabled={
                              (activeLesson.quiz_questions?.length ?? 0) === 0 ||
                              (activeLesson.quiz_questions ?? []).some((q) => !quizAnswers[q.id]) ||
                              quizResult?.attempts_remaining === 0
                            }
                          >
                            Enviar respostas
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                {activeLesson.lesson_type !== "quiz" && (
                  <div className="flex items-center justify-end pt-2">
                    {isCompleted(activeLesson.id) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300">
                        <CheckCircle2 className="h-4 w-4" />
                        Aula concluída
                      </span>
                    ) : (
                      <Button onClick={handleComplete} isLoading={completing}>
                        <CheckCircle2 className="h-4 w-4" />
                        Marcar como concluída
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                Selecione uma aula
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lista de aulas */}
        <Card>
          <CardContent className="p-3">
            <h3 className="mb-3 text-sm font-semibold">Aulas do curso</h3>
            {course.modules.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem aulas.</p>
            ) : (
              <div className="space-y-3">
                {course.modules.map((m) => (
                  <div key={m.id}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {m.title}
                    </p>
                    <div className="mt-1 space-y-1">
                      {m.lessons.map((l) => {
                        const Icon = TYPE_ICONS[l.lesson_type];
                        const done = isCompleted(l.id);
                        const isActive = activeLesson?.id === l.id;
                        const locked = l.lesson_type === "quiz" && !done && !isQuizUnlocked(l);
                        return (
                          <button
                            type="button"
                            key={l.id}
                            onClick={() => selectLesson(l)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs transition",
                              isActive
                                ? "bg-primary/10 text-foreground"
                                : "hover:bg-muted",
                              locked && "opacity-55"
                            )}
                          >
                            {locked ? (
                              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : done ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">
                              {l.title}
                            </span>
                            {l.duration_sec && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {Math.floor(l.duration_sec / 60)}min
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}
