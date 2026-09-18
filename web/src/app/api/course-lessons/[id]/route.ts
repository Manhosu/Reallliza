import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { ASAAS_MIN_CHARGE_CENTS } from "@/lib/asaas/client";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const body = await request.json();

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = String(body.title).slice(0, 200);
    if (body.description !== undefined)
      update.description = body.description ? String(body.description).slice(0, 1000) : null;
    if (body.lesson_type !== undefined) update.lesson_type = body.lesson_type;
    if (body.video_url !== undefined) update.video_url = body.video_url || null;
    if (body.pdf_url !== undefined) update.pdf_url = body.pdf_url || null;
    if (body.image_url !== undefined) update.image_url = body.image_url || null;
    if (body.attachment_url !== undefined) update.attachment_url = body.attachment_url || null;
    if (body.attachment_name !== undefined) {
      update.attachment_name = body.attachment_name ? String(body.attachment_name).slice(0, 200) : null;
    }
    if (body.content_md !== undefined)
      update.content_md = body.content_md ? String(body.content_md).slice(0, 50000) : null;
    if (body.quiz_questions !== undefined) update.quiz_questions = body.quiz_questions;
    if (body.min_passing_score !== undefined) {
      update.min_passing_score =
        typeof body.min_passing_score === "number"
          ? Math.max(0, Math.min(100, body.min_passing_score))
          : null;
    }
    if (body.max_attempts !== undefined) {
      update.max_attempts =
        typeof body.max_attempts === "number" && body.max_attempts > 0
          ? Math.round(body.max_attempts)
          : null;
    }
    if (body.retest_price_cents !== undefined) {
      if (
        typeof body.retest_price_cents === "number" &&
        body.retest_price_cents > 0 &&
        body.retest_price_cents < ASAAS_MIN_CHARGE_CENTS
      ) {
        // Cobrança abaixo disso é recusada pela Asaas em silêncio no
        // pagamento (createCharge engolia o erro) — o aluno nunca via a
        // página de pagamento (Jéssica, 18/09).
        throw new AuthError(
          400,
          `O preço do reteste precisa ser de pelo menos R$ ${(ASAAS_MIN_CHARGE_CENTS / 100).toFixed(2)} — valores menores são recusados no pagamento.`
        );
      }
      update.retest_price_cents =
        typeof body.retest_price_cents === "number" && body.retest_price_cents > 0
          ? Math.round(body.retest_price_cents)
          : null;
    }
    if (body.duration_sec !== undefined) update.duration_sec = body.duration_sec;
    if (body.order_index !== undefined) update.order_index = body.order_index;
    if (body.is_required !== undefined) update.is_required = !!body.is_required;
    if (body.is_published !== undefined) update.is_published = !!body.is_published;

    if (Object.keys(update).length === 0) throw new AuthError(400, "Nada para atualizar");

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("course_lessons")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error("Falha ao atualizar aula");
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();
    const { error } = await supabase.from("course_lessons").delete().eq("id", id);
    if (error) throw new Error("Falha ao remover aula");
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
