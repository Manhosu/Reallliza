import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createCharge, isAsaasConfigured } from "@/lib/asaas/client";
import { hasAccessToCourse } from "@/lib/courses/access";

/**
 * POST /api/courses/[id]/purchase
 * Inicia a compra de um curso pago. Mesmo padrão de /api/quotes/[id]/pay:
 * reaproveita uma compra pendente com checkout já gerado, senão cria a
 * cobrança na Asaas (link hospedado — funciona igual em web e mobile via
 * Linking.openURL). Quem confirma é o webhook (confirmarPagamentoAsaas).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: course } = await supabase
      .from("courses")
      .select("id, title, price_cents, is_published")
      .eq("id", id)
      .maybeSingle();
    if (!course || !course.is_published) throw new AuthError(404, "Curso não encontrado");
    if (!course.price_cents || course.price_cents <= 0) {
      throw new AuthError(400, "Este curso é gratuito — não precisa comprar");
    }

    if (await hasAccessToCourse(supabase, user.id, course)) {
      throw new AuthError(400, "Você já tem acesso a este curso");
    }

    const { data: existing } = await supabase
      .from("course_purchases")
      .select("id, checkout_url")
      .eq("course_id", id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.checkout_url) {
      return jsonResponse({ purchase_id: existing.id, checkout_url: existing.checkout_url });
    }

    const priceReais = course.price_cents / 100;

    const { data: purchase, error: purchaseErr } = await supabase
      .from("course_purchases")
      .insert({
        course_id: id,
        user_id: user.id,
        price_cents: course.price_cents,
        status: "pending",
      })
      .select("id")
      .single();
    if (purchaseErr || !purchase) throw new Error("Falha ao registrar a compra");

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
          description: `Curso: ${course.title} — Reallliza`,
          customerName: user.full_name || user.email,
          customerDocument,
          customerEmail: user.email,
          externalReference: purchase.id,
        });
        if (charge) {
          checkoutUrl = charge.checkoutUrl;
          await supabase
            .from("course_purchases")
            .update({ asaas_id: charge.asaasId, checkout_url: charge.checkoutUrl })
            .eq("id", purchase.id);
        }
      } catch (chargeError) {
        // Sem documento válido na Asaas (ou outra falha da API), a compra
        // não pode ficar 500 pro usuário — fica pendente pra confirmação
        // manual do admin (mesma tela de liberar acesso da Fase A) em vez
        // de travar o fluxo inteiro.
        console.error(
          `course.purchase: falha ao criar cobrança Asaas (${purchase.id}): ${
            chargeError instanceof Error ? chargeError.message : chargeError
          }`
        );
      }
    }

    logAudit({
      userId: user.id,
      action: "course.purchase_started",
      entityType: "course",
      entityId: id,
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
