import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createCharge, isAsaasConfigured } from "@/lib/asaas/client";
import { getQuizStatus } from "@/lib/courses/quiz-status";

/**
 * POST /api/course-lessons/[id]/retest-purchase
 * Inicia a compra do reteste pago de uma aula de quiz (Jéssica, 17/09):
 * esgotou as tentativas sem aprovar, esta rota gera a cobrança que libera
 * mais uma tentativa. Mesmo padrão de /api/courses/[id]/purchase, só que
 * por aula em vez de por curso.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id: lessonId } = await params;
    const supabase = getAdminClient();

    const { data: lesson } = await supabase
      .from("course_lessons")
      .select("id, title, lesson_type, max_attempts, retest_price_cents")
      .eq("id", lessonId)
      .maybeSingle();
    if (!lesson || lesson.lesson_type !== "quiz") throw new AuthError(404, "Quiz não encontrado");
    if (!lesson.retest_price_cents || lesson.retest_price_cents <= 0) {
      throw new AuthError(400, "Esta avaliação não tem reteste pago configurado");
    }

    const status = await getQuizStatus(supabase, user.id, lessonId, lesson.max_attempts);
    if (!status.exhausted) {
      throw new AuthError(400, "Você ainda tem tentativas disponíveis nesta avaliação");
    }
    if (status.retest_unlocked) {
      throw new AuthError(400, "Você já tem um reteste pago liberado — é só tentar de novo");
    }

    const { data: existing } = await supabase
      .from("quiz_retest_purchases")
      .select("id, checkout_url")
      .eq("lesson_id", lessonId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.checkout_url) {
      return jsonResponse({ purchase_id: existing.id, checkout_url: existing.checkout_url });
    }

    const priceReais = lesson.retest_price_cents / 100;

    // Já existe uma compra pendente sem checkout (tentativa anterior falhou
    // na Asaas) — reaproveita a mesma linha em vez de empilhar uma nova a
    // cada clique (achado 18/09: 3 linhas pendentes idênticas pro mesmo
    // aluno/aula, todas travadas pelo mesmo motivo).
    const purchase = existing
      ? existing
      : (
          await supabase
            .from("quiz_retest_purchases")
            .insert({
              lesson_id: lessonId,
              user_id: user.id,
              price_cents: lesson.retest_price_cents,
              status: "pending",
            })
            .select("id")
            .single()
        ).data;
    if (!purchase) throw new Error("Falha ao registrar o reteste");

    let checkoutUrl: string | null = null;

    if (isAsaasConfigured()) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("cpf")
        .eq("id", user.id)
        .maybeSingle();
      const cpfDigits = (profile?.cpf ?? "").replace(/\D/g, "");
      const customerDocument =
        cpfDigits.length === 11 || cpfDigits.length === 14 ? cpfDigits : undefined;

      try {
        const charge = await createCharge({
          amount: priceReais,
          description: `Reteste: ${lesson.title} — Reallliza`,
          customerName: user.full_name || user.email,
          customerDocument,
          customerEmail: user.email,
          externalReference: purchase.id,
        });
        if (charge) {
          checkoutUrl = charge.checkoutUrl;
          await supabase
            .from("quiz_retest_purchases")
            .update({ asaas_id: charge.asaasId, checkout_url: charge.checkoutUrl })
            .eq("id", purchase.id);
        }
      } catch (chargeError) {
        console.error(
          `quiz.retest_purchase: falha ao criar cobrança Asaas (${purchase.id}): ${
            chargeError instanceof Error ? chargeError.message : chargeError
          }`
        );
      }
    }

    logAudit({
      userId: user.id,
      action: "quiz_retest.purchase_started",
      entityType: "course_lesson",
      entityId: lessonId,
      newData: { purchase_id: purchase.id, asaas: !!checkoutUrl },
    });

    return jsonResponse({
      purchase_id: purchase.id,
      checkout_url: checkoutUrl,
      manual: !checkoutUrl,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
