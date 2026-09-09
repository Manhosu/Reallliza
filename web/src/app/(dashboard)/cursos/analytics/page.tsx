"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  GraduationCap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Analytics {
  total_enrolled: number;
  total_completed: number;
  total_failed: number;
  avg_progress_pct: number;
  avg_days_to_complete: number;
  certificates_issued: number;
  per_course: Array<{
    course_id: string;
    title: string;
    is_paid: boolean;
    enrolled: number;
    completed: number;
    failed: number;
    avg_progress_pct: number;
    avg_days_to_complete: number;
    certificates_issued: number;
  }>;
}

interface StudentRow {
  id: string;
  status: string;
  progress_pct: number;
  enrolled_at: string;
  completed_at: string | null;
  last_activity_at: string;
  certificate_code: string | null;
  user: { id: string; full_name: string; email: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "Em andamento",
  completed: "Aprovado",
  failed: "Reprovado",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  in_progress: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  completed: "bg-green-500/10 text-green-700 dark:text-green-300",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function CursosAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openCourse, setOpenCourse] = useState<{ id: string; title: string } | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.get<Analytics>("/courses/analytics");
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function abrirCurso(courseId: string, title: string) {
    setOpenCourse({ id: courseId, title });
    setLoadingStudents(true);
    try {
      const result = await apiClient.get<{ students: StudentRow[] }>(
        `/courses/analytics?course_id=${courseId}`
      );
      setStudents(result.students);
    } catch (err) {
      console.error(err);
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          href="/cursos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Cursos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight lg:text-3xl">
          Analytics de Cursos
        </h1>
        <p className="text-muted-foreground">
          Matriculados, aprovados, reprovados e certificados emitidos por curso.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          label="Matriculados"
          value={String(data?.total_enrolled ?? 0)}
          icon={Users}
          accent="border-t-blue-500"
          bg="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="Aprovados"
          value={String(data?.total_completed ?? 0)}
          icon={CheckCircle2}
          accent="border-t-green-500"
          bg="bg-green-500/10 text-green-600 dark:text-green-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="Reprovados"
          value={String(data?.total_failed ?? 0)}
          icon={XCircle}
          accent="border-t-red-500"
          bg="bg-red-500/10 text-red-600 dark:text-red-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="% Conclusão média"
          value={`${data?.avg_progress_pct ?? 0}%`}
          icon={GraduationCap}
          accent="border-t-violet-500"
          bg="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="Tempo médio"
          value={`${data?.avg_days_to_complete ?? 0}d`}
          hint={`${data?.certificates_issued ?? 0} certificados`}
          icon={Clock}
          accent="border-t-amber-500"
          bg="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          isLoading={isLoading}
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Por curso</h2>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : (data?.per_course.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum curso com matrícula ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[720px] space-y-1">
                <div className="grid grid-cols-7 gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="col-span-2">Curso</span>
                  <span>Matriculados</span>
                  <span>Aprovados</span>
                  <span>Reprovados</span>
                  <span>Conclusão média</span>
                  <span>Certificados</span>
                </div>
                {data?.per_course.map((c) => (
                  <button
                    key={c.course_id}
                    type="button"
                    onClick={() => abrirCurso(c.course_id, c.title)}
                    className="grid w-full grid-cols-7 items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition hover:bg-muted"
                  >
                    <span className="col-span-2 truncate font-medium">
                      {c.title}
                      {c.is_paid && (
                        <span className="ml-1.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                          Pago
                        </span>
                      )}
                    </span>
                    <span>{c.enrolled}</span>
                    <span className="text-green-600 dark:text-green-400">{c.completed}</span>
                    <span className="text-destructive">{c.failed}</span>
                    <span>{c.avg_progress_pct}%</span>
                    <span>{c.certificates_issued}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!openCourse} onClose={() => setOpenCourse(null)}>
        <DialogHeader>
          <DialogTitle>Alunos — {openCourse?.title}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-2">
          {loadingStudents ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum aluno matriculado ainda.
            </p>
          ) : (
            students.map((s) => (
              <div key={s.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.user?.full_name ?? "—"}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      STATUS_COLORS[s.status] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{s.user?.email}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span>Progresso: {s.progress_pct}%</span>
                  <span>Concluído: {fmtDate(s.completed_at)}</span>
                  <span>Último acesso: {fmtDate(s.last_activity_at)}</span>
                </div>
              </div>
            ))
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  bg,
  isLoading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  bg: string;
  isLoading: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-t-2 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5",
        accent
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className={cn("rounded-lg p-1.5", bg)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-base font-bold tracking-tight">
        {isLoading ? "..." : value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
