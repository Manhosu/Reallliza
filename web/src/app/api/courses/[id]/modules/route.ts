import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * POST /api/courses/[id]/modules — cria modulo. Apenas admin.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const body = await request.json();

    if (!body.title) throw new AuthError(400, "title obrigatorio");

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("course_modules")
      .insert({
        course_id: id,
        title: String(body.title).slice(0, 200),
        description: body.description ? String(body.description).slice(0, 1000) : null,
        order_index: typeof body.order_index === "number" ? body.order_index : 0,
        is_published: body.is_published !== false,
      })
      .select()
      .single();

    if (error) throw new Error("Falha ao criar modulo");

    logAudit({
      userId: user.id,
      action: "course_module.created",
      entityType: "course_module",
      entityId: (data as { id: string }).id,
      newData: { course_id: id, title: body.title },
    });

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
