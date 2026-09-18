import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { ASAAS_MIN_CHARGE_CENTS } from "@/lib/asaas/client";

/**
 * POST /api/course-modules/[id]/lessons — cria aula. Apenas admin.
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
    const lessonType = body.lesson_type ?? "video";
    if (!["video", "text", "quiz", "pdf", "image", "attachment"].includes(lessonType)) {
      throw new AuthError(400, "lesson_type invalido");
    }
    if (
      typeof body.retest_price_cents === "number" &&
      body.retest_price_cents > 0 &&
      body.retest_price_cents < ASAAS_MIN_CHARGE_CENTS
    ) {
      throw new AuthError(
        400,
        `O preço do reteste precisa ser de pelo menos R$ ${(ASAAS_MIN_CHARGE_CENTS / 100).toFixed(2)} — valores menores são recusados no pagamento.`
      );
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("course_lessons")
      .insert({
        module_id: id,
        title: String(body.title).slice(0, 200),
        description: body.description ? String(body.description).slice(0, 1000) : null,
        lesson_type: lessonType,
        video_url: body.video_url || null,
        pdf_url: body.pdf_url || null,
        image_url: body.image_url || null,
        attachment_url: body.attachment_url || null,
        attachment_name: body.attachment_name ? String(body.attachment_name).slice(0, 200) : null,
        content_md: body.content_md ? String(body.content_md).slice(0, 50000) : null,
        quiz_questions: body.quiz_questions ?? null,
        min_passing_score:
          typeof body.min_passing_score === "number"
            ? Math.max(0, Math.min(100, body.min_passing_score))
            : null,
        max_attempts:
          typeof body.max_attempts === "number" && body.max_attempts > 0
            ? Math.round(body.max_attempts)
            : null,
        retest_price_cents:
          typeof body.retest_price_cents === "number" && body.retest_price_cents > 0
            ? Math.round(body.retest_price_cents)
            : null,
        learning_content_id: body.learning_content_id || null,
        duration_sec: typeof body.duration_sec === "number" ? body.duration_sec : null,
        order_index: typeof body.order_index === "number" ? body.order_index : 0,
        is_required: body.is_required !== false,
        is_published: body.is_published !== false,
      })
      .select()
      .single();

    if (error) throw new Error("Falha ao criar aula");
    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
