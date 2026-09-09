import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/certificado/[code]
 * Verificação PÚBLICA (sem autenticação) de certificado de curso — mesmo
 * padrão de /api/relatorio/[code], que já resolve esse problema pro
 * Relatório Técnico de OS. `certificate_code` deixa de ser só decorativo
 * (comentário antigo em relatorio/[code]/route.ts) e passa a ser
 * consultável de verdade.
 *
 * Retorna só o essencial — nada de e-mail ou outro dado sensível do aluno.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const supabase = getAdminClient();

    const { data: enr, error } = await supabase
      .from("course_enrollments")
      .select(
        "certificate_code, completed_at, certificate_issued_at, course:courses(title, workload_hours), user:profiles(full_name)"
      )
      .eq("certificate_code", code)
      .maybeSingle();

    if (error || !enr) {
      return jsonResponse({ valid: false });
    }

    const course = enr.course as unknown as { title: string; workload_hours: number | null } | null;
    const user = enr.user as unknown as { full_name: string } | null;

    return jsonResponse({
      valid: true,
      student_name: user?.full_name ?? null,
      course_title: course?.title ?? null,
      workload_hours: course?.workload_hours ?? null,
      completed_at: enr.completed_at,
      issued_at: enr.certificate_issued_at,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
