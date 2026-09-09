import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/courses/analytics
 * Painel administrativo do Módulo de Cursos: matriculados, aprovados,
 * reprovados, % médio de conclusão, tempo médio até concluir, certificados
 * emitidos — globais e por curso. Mesmo padrão de agregação de /api/bi
 * (várias queries em paralelo + agregação em JS).
 *
 * Query: ?course_id=X — troca o resumo por curso pela lista de alunos
 * daquele curso (histórico de acesso via last_activity_at).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const supabase = getAdminClient();
    const courseId = request.nextUrl.searchParams.get("course_id");

    if (courseId) {
      const { data: enrollments, error } = await supabase
        .from("course_enrollments")
        .select(
          "id, status, progress_pct, enrolled_at, completed_at, last_activity_at, certificate_code, user:profiles(id, full_name, email)"
        )
        .eq("course_id", courseId)
        .order("last_activity_at", { ascending: false });
      if (error) throw new Error("Falha ao carregar alunos do curso");

      return jsonResponse({ students: enrollments ?? [] });
    }

    const [{ data: courses }, { data: enrollments }] = await Promise.all([
      supabase.from("courses").select("id, title, price_cents"),
      supabase
        .from("course_enrollments")
        .select(
          "course_id, status, progress_pct, enrolled_at, completed_at, certificate_issued_at"
        ),
    ]);

    type EnrRow = {
      course_id: string;
      status: string;
      progress_pct: number;
      enrolled_at: string;
      completed_at: string | null;
      certificate_issued_at: string | null;
    };
    const allEnr = (enrollments as EnrRow[] | null) ?? [];

    function summarize(rows: EnrRow[]) {
      const enrolled = rows.length;
      const completed = rows.filter((r) => r.status === "completed").length;
      const failed = rows.filter((r) => r.status === "failed").length;
      const avgProgress =
        enrolled > 0
          ? Math.round(rows.reduce((s, r) => s + (r.progress_pct || 0), 0) / enrolled)
          : 0;
      const completedWithDates = rows.filter((r) => r.status === "completed" && r.completed_at);
      const avgDaysToComplete =
        completedWithDates.length > 0
          ? Math.round(
              (completedWithDates.reduce(
                (s, r) =>
                  s +
                  (new Date(r.completed_at as string).getTime() -
                    new Date(r.enrolled_at).getTime()),
                0
              ) /
                completedWithDates.length) /
                (1000 * 60 * 60 * 24)
            )
          : 0;
      const certificatesIssued = rows.filter((r) => r.certificate_issued_at).length;
      return { enrolled, completed, failed, avgProgress, avgDaysToComplete, certificatesIssued };
    }

    const global = summarize(allEnr);

    const byCourseMap = new Map<string, EnrRow[]>();
    for (const r of allEnr) {
      const arr = byCourseMap.get(r.course_id) ?? [];
      arr.push(r);
      byCourseMap.set(r.course_id, arr);
    }

    const courseRows =
      (courses as Array<{ id: string; title: string; price_cents: number | null }> | null) ?? [];
    const per_course = courseRows.map((c) => {
      const s = summarize(byCourseMap.get(c.id) ?? []);
      return {
        course_id: c.id,
        title: c.title,
        is_paid: !!c.price_cents,
        enrolled: s.enrolled,
        completed: s.completed,
        failed: s.failed,
        avg_progress_pct: s.avgProgress,
        avg_days_to_complete: s.avgDaysToComplete,
        certificates_issued: s.certificatesIssued,
      };
    });

    return jsonResponse({
      total_enrolled: global.enrolled,
      total_completed: global.completed,
      total_failed: global.failed,
      avg_progress_pct: global.avgProgress,
      avg_days_to_complete: global.avgDaysToComplete,
      certificates_issued: global.certificatesIssued,
      per_course: per_course.sort((a, b) => b.enrolled - a.enrolled),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
