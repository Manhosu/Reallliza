"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  GraduationCap,
  CheckCircle2,
  Clock,
  Award,
  PlayCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  emit_certificate: boolean;
  required_completion_pct: number;
  modules?: Array<{
    id: string;
    lessons?: Array<{ id: string }>;
  }>;
  enrollment?: {
    id: string;
    status: "in_progress" | "completed" | "cancelled";
    progress_pct: number;
    completed_at: string | null;
    certificate_code: string | null;
  } | null;
}

export default function AprendizadoPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<Course[]>("/courses");
      setCourses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inProgress = courses.filter(
    (c) => c.enrollment?.status === "in_progress"
  );
  const completed = courses.filter(
    (c) => c.enrollment?.status === "completed"
  );
  const available = courses.filter((c) => !c.enrollment);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Aprendizado
        </h1>
        <p className="text-muted-foreground">
          Cursos e treinamentos da Reallliza para a sua função.
        </p>
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title="Sem cursos disponíveis ainda"
          description="Logo, novos cursos vão aparecer aqui."
        />
      ) : (
        <div className="space-y-6">
          {inProgress.length > 0 && (
            <Section title="Em andamento" icon={Clock}>
              <CourseGrid courses={inProgress} />
            </Section>
          )}
          {available.length > 0 && (
            <Section title="Disponíveis" icon={PlayCircle}>
              <CourseGrid courses={available} />
            </Section>
          )}
          {completed.length > 0 && (
            <Section title="Concluídos" icon={Award}>
              <CourseGrid courses={completed} />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function CourseGrid({ courses }: { courses: Course[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => {
        const lessonCount =
          c.modules?.reduce((s, m) => s + (m.lessons?.length ?? 0), 0) ?? 0;
        const pct = c.enrollment?.progress_pct ?? 0;
        const isCompleted = c.enrollment?.status === "completed";
        return (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link href={`/aprendizado/${c.id}`} className="block">
              <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                        isCompleted
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-6 w-6" />
                      ) : (
                        <GraduationCap className="h-6 w-6" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-tight">{c.title}</h3>
                      {c.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {lessonCount} aula{lessonCount === 1 ? "" : "s"}
                      </span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full transition-all",
                          isCompleted ? "bg-green-500" : "bg-primary"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {isCompleted && c.enrollment?.certificate_code && (
                    <a
                      href={`/api/course-enrollments/${c.enrollment.id}/certificate`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                    >
                      <Award className="h-3.5 w-3.5" />
                      Baixar certificado
                    </a>
                  )}
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
