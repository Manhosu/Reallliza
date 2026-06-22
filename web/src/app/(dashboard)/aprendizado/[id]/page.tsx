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
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: "video" | "text" | "quiz" | "pdf";
  video_url: string | null;
  pdf_url: string | null;
  content_md: string | null;
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
      // Auto-enroll
      if (!data.enrollment) {
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

  function isCompleted(lessonId: string): boolean {
    return !!course?.progress?.find(
      (p) => p.lesson_id === lessonId && p.completed_at
    );
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
                {activeLesson.lesson_type === "quiz" && (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Quiz será exibido aqui.
                  </div>
                )}

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
                        return (
                          <button
                            type="button"
                            key={l.id}
                            onClick={() => setActiveLesson(l)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs transition",
                              isActive
                                ? "bg-primary/10 text-foreground"
                                : "hover:bg-muted"
                            )}
                          >
                            {done ? (
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
    </div>
  );
}
