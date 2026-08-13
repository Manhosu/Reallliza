import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { resolveQuotePayload } from "@/lib/quotes/build-quote";

/**
 * GET /api/quotes/[id]
 * Detalhe de um orçamento com itens e pagamentos. Admin vê qualquer um;
 * partner só os da própria loja.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "partner"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("quotes")
      .select(
        `
        *,
        partner:partners(id, company_name, trading_name, cnpj, contact_name, contact_email, contact_phone, address, user_id),
        items:quote_items(*),
        payments(id, status, method, amount, checkout_url, created_at, paid_at)
      `
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new AuthError(404, "Orçamento não encontrado");
    }

    // Dados institucionais Reallliza (contratada) — Jessica 20/07: tela
    // /orcamentos/[id] deve mostrar mesmo conteudo do PDF, incluindo bloco
    // "Dados da Contratada".
    const { data: settings } = await supabase
      .from("company_settings")
      .select("legal_name, cnpj, base_address, phone, email")
      .limit(1)
      .maybeSingle();
    (data as Record<string, unknown>).company_settings = settings ?? null;

    // Isolamento: partner só acessa orçamentos da própria loja.
    if (user.role === "partner") {
      const partner = data.partner as { user_id?: string } | null;
      if (!partner || partner.user_id !== user.id) {
        throw new AuthError(403, "Sem acesso a este orçamento");
      }
    }

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Estados em que o orçamento ainda pode ser corrigido. */
const EDITAVEL = ["draft", "awaiting_payment"];

/**
 * PUT /api/quotes/[id]
 *
 * Jessica 12/08: "Precisamos de um botão Editar no orçamento, mas só enquanto
 * ele não estiver pago. A ideia é a loja conseguir corrigir erros durante a
 * elaboração — quantidade, valores, informações do serviço. A partir do
 * momento em que o orçamento for pago, ele deve ser bloqueado: precisa ficar
 * como registro definitivo, sem alteração das informações que deram origem à
 * Ordem de Serviço."
 *
 * Como preço e horas são snapshot em `quote_items`, editar refaz o cálculo
 * inteiro pelo mesmo caminho da criação (resolveQuotePayload) e substitui os
 * itens.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "partner"]);

    const { id } = await params;
    const supabase = getAdminClient();
    const body = (await request.json()) as Record<string, unknown>;

    const { data: atual, error: findErr } = await supabase
      .from("quotes")
      .select("id, status, partner_id, quote_number, partner:partners(user_id)")
      .eq("id", id)
      .single();

    if (findErr || !atual) throw new AuthError(404, "Orçamento não encontrado");

    if (user.role === "partner") {
      const partner = atual.partner as { user_id?: string } | null;
      if (!partner || partner.user_id !== user.id) {
        throw new AuthError(403, "Sem acesso a este orçamento");
      }
    }

    // O bloqueio que ela pediu. Depois de pago o orçamento é o registro que
    // deu origem à OS — mexer nele desfaria o histórico do que foi contratado.
    if (!EDITAVEL.includes(atual.status as string)) {
      throw new AuthError(
        400,
        atual.status === "cancelled"
          ? "Este orçamento foi cancelado e não pode ser editado."
          : "Este orçamento já foi pago e não pode mais ser editado. Ele é o registro que deu origem à Ordem de Serviço."
      );
    }

    const resolved = await resolveQuotePayload(supabase, body);
    const { itemRows, modality, calc, totalFinal } = resolved;

    const sanitizeDoc = (v: unknown) =>
      typeof v === "string" ? v.replace(/\D/g, "").slice(0, 14) : null;

    const updatePayload: Record<string, unknown> = {
      modality,
      client_name: body.client_name ? String(body.client_name).trim() : undefined,
      client_phone: body.client_phone ?? null,
      client_whatsapp: body.client_whatsapp ?? null,
      client_email: body.client_email ?? null,
      client_document: sanitizeDoc(body.client_document),
      address_street: body.address_street ?? null,
      address_number: body.address_number ?? null,
      address_complement: body.address_complement ?? null,
      address_neighborhood: body.address_neighborhood ?? null,
      address_city: body.address_city ?? null,
      address_state: body.address_state ?? null,
      address_zip: body.address_zip ?? null,
      service_date: body.service_date ?? null,
      service_time: body.service_time ?? null,
      region_city: body.region_city ?? null,
      region_state: body.region_state ?? null,
      notes: body.notes ?? null,
      total_amount: totalFinal,
      allow_weekend: !!body.allow_weekend,
      updated_at: new Date().toISOString(),
    };

    if (calc) {
      Object.assign(updatePayload, {
        subtotal_services: calc.subtotal_services,
        total_hours: calc.total_hours,
        total_days: calc.total_days,
        travel_distance_km: calc.travel_distance_km,
        travel_cost: calc.travel_cost,
        stay_count: calc.stay_count,
        stay_cost: calc.stay_cost,
        is_special_hour: calc.is_special_hour,
        special_hour_extra: calc.special_hour_extra,
        platform_fee_pct: calc.platform_fee_pct,
        platform_fee_amount: calc.platform_fee_amount,
        payout_amount: calc.payout_amount,
      });
    }

    // Se havia cobrança pendente, ela é de um valor que não vale mais.
    // Sem isso a loja pagaria o total antigo: a rota /pay reaproveita o
    // checkout existente quando encontra um.
    let cobrancaCancelada = false;
    if (atual.status === "awaiting_payment") {
      const { data: pendentes } = await supabase
        .from("payments")
        .select("id")
        .eq("quote_id", id)
        .eq("status", "pending");

      if (pendentes && pendentes.length > 0) {
        await supabase
          .from("payments")
          .update({ status: "cancelled" })
          .eq("quote_id", id)
          .eq("status", "pending");
        cobrancaCancelada = true;
      }
      // Volta para rascunho: a cobrança precisa ser gerada de novo com o
      // valor corrigido.
      updatePayload.status = "draft";
    }

    for (const k of Object.keys(updatePayload)) {
      if (updatePayload[k] === undefined) delete updatePayload[k];
    }

    const { error: updErr } = await supabase
      .from("quotes")
      .update(updatePayload)
      .eq("id", id);
    if (updErr) throw new Error(`Falha ao atualizar: ${updErr.message}`);

    // Itens são snapshot: troca o conjunto inteiro.
    const { error: delErr } = await supabase
      .from("quote_items")
      .delete()
      .eq("quote_id", id);
    if (delErr) throw new Error(`Falha ao limpar itens: ${delErr.message}`);

    const { error: insErr } = await supabase
      .from("quote_items")
      .insert(itemRows.map((r) => ({ quote_id: id, ...r })));
    if (insErr) throw new Error(`Falha ao gravar itens: ${insErr.message}`);

    logAudit({
      userId: user.id,
      action: "quote.updated",
      entityType: "quote",
      entityId: id,
      newData: {
        total_amount: totalFinal,
        items: itemRows.length,
        payment_cancelled: cobrancaCancelada,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse({
      id,
      total_amount: totalFinal,
      payment_cancelled: cobrancaCancelada,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
