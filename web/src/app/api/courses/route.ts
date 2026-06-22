import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/courses
 * Lista cursos. Admin ve todos; outros usuarios veem apenas published
 * compativeis com sua audience (mais 'all').
 *
 * Query: ?include_unpublished=true (admin)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const supabase = getAdminClient();
    const includeUnpub = request.nextUrl.searchParams.get("include_unpublished") === "true";

    let query = supabase
      .from("courses")
      .select(
        "*, modules:course_modules(id, title, description, order_index, is_published, lessons:course_lessons(id, title, lesson_type, duration_sec, order_index, is_published, is_required))"
      )
      .order("order_index");

    if (!(user.role === "admin" && includeUnpub)) {
      query = query.eq("is_published", true);
    }
    if (user.role === "technician") {
      query = query.in("audience", ["all", "technician"]);
    } else if (user.role === "partner") {
      query = query.in("audience", ["all", "partner"]);
    }

    const { data, error } = await query;
    if (error) throw new Error("Falha ao listar cursos");

    // Enrich com enrollment do user
    if (data && data.length > 0 && user.role !== "admin") {
      const ids = (data as Array<{ id: string }>).map((c) => c.id);
      const { data: enrolls } = await supabase
        .from("course_enrollments")
        .select("*")
        .eq("user_id", user.id)
        .in("course_id", ids);

      const map = new Map(
        ((enrolls as Array<{ course_id: string }> | null) ?? []).map((e) => [e.course_id, e])
      );
      return jsonResponse(
        (data as Array<{ id: string }>).map((c) => ({
          ...c,
          enrollment: map.get(c.id) ?? null,
        }))
      );
    }

    return jsonResponse(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/courses — cria curso. Apenas admin.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      throw new AuthError(400, "title obrigatorio");
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("courses")
      .insert({
        title: String(body.title).trim().slice(0, 200),
        description: body.description ? String(body.description).slice(0, 2000) : null,
        thumbnail_url: body.thumbnail_url || null,
        audience: body.audience ?? "technician",
        order_index: typeof body.order_index === "number" ? body.order_index : 0,
        is_published: body.is_published !== false,
        emit_certificate: body.emit_certificate !== false,
        required_completion_pct:
          typeof body.required_completion_pct === "number"
            ? Math.max(0, Math.min(100, body.required_completion_pct))
            : 100,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw new Error("Falha ao criar curso");

    logAudit({
      userId: user.id,
      action: "course.created",
      entityType: "course",
      entityId: (data as { id: string }).id,
      newData: { title: body.title },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
