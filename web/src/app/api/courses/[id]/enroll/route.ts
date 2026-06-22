import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * POST /api/courses/[id]/enroll — matricula o user no curso. Idempotente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    // Verifica curso e audience
    const { data: course } = await supabase
      .from("courses")
      .select("id, audience, is_published")
      .eq("id", id)
      .single();
    if (!course) throw new AuthError(404, "Curso nao encontrado");
    const c = course as { audience: string; is_published: boolean };
    if (!c.is_published) throw new AuthError(400, "Curso nao publicado");
    if (c.audience !== "all" && c.audience !== user.role) {
      throw new AuthError(403, "Esse curso nao e pra seu perfil");
    }

    const { data: existing } = await supabase
      .from("course_enrollments")
      .select("*")
      .eq("user_id", user.id)
      .eq("course_id", id)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ ...existing, already_enrolled: true });
    }

    const { data, error } = await supabase
      .from("course_enrollments")
      .insert({
        course_id: id,
        user_id: user.id,
        status: "in_progress",
        progress_pct: 0,
      })
      .select()
      .single();

    if (error) throw new Error("Falha ao matricular");
    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
