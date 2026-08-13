import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveQuotePayload } from "@/lib/quotes/build-quote";

interface IncomingItem {
  service_id?: string;
  quantity?: number;
}

/** Resolve o partner_id do usuário logado (papel partner). */
async function resolvePartnerId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("partners")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * GET /api/quotes
 * Lista orçamentos. Admin vê todos; partner vê os próprios.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "partner"]);

    const supabase = getAdminClient();

    let query = supabase
      .from("quotes")
      .select("*, partner:partners(id, company_name)")
      .order("created_at", { ascending: false });

    if (user.role === "partner") {
      const partnerId = await resolvePartnerId(supabase, user.id);
      if (!partnerId) return jsonResponse([]);
      query = query.eq("partner_id", partnerId);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Failed to list quotes: ${error.message}`);
      throw new Error("Falha ao listar orçamentos");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/quotes
 * Cria um orçamento a partir do catálogo de serviços.
 * Partner cria para a própria loja; admin precisa informar partner_id.
 * Body: { partner_id?, client_name, client_phone?, client_email?,
 *         address_street?, address_city?, address_state?, address_zip?,
 *         notes?, items: [{ service_id, quantity }] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager", "partner"]);

    const body = await request.json();
    const supabase = getAdminClient();

    // Resolve a loja.
    let partnerId: string | null;
    if (user.role === "partner") {
      partnerId = await resolvePartnerId(supabase, user.id);
      if (!partnerId) {
        throw new AuthError(403, "Sua conta não está vinculada a uma loja parceira");
      }
    } else {
      partnerId = body.partner_id || null;
      if (!partnerId) {
        throw new AuthError(400, "partner_id é obrigatório");
      }
    }

    if (!body.client_name || !String(body.client_name).trim()) {
      throw new AuthError(400, "Nome do cliente é obrigatório");
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new AuthError(400, "Adicione ao menos um serviço ao orçamento");
    }

    // Resolve itens, valida UF, recalcula e confere a janela de execução.
    // Mesmo caminho usado pelo PUT — duplicar aqui faria as duas cópias
    // divergirem no primeiro ajuste de regra.
    const { itemRows, modality, calc, totalFinal } = await resolveQuotePayload(
      supabase,
      body
    );

    // CPF/CNPJ: armazena so digitos
    const sanitizeDoc = (v: unknown) =>
      typeof v === "string" ? v.replace(/D/g, "").slice(0, 14) : null;

    const insertPayload: Record<string, unknown> = {
      partner_id: partnerId,
      status: "draft",
      modality,
      client_name: String(body.client_name).trim(),
      client_phone: body.client_phone || null,
      client_whatsapp: body.client_whatsapp || null,
      client_email: body.client_email || null,
      client_document: sanitizeDoc(body.client_document) || null,
      address_street: body.address_street || null,
      address_number: body.address_number || null,
      address_complement: body.address_complement || null,
      address_neighborhood: body.address_neighborhood || null,
      address_city: body.address_city || null,
      address_state: body.address_state || null,
      address_zip: body.address_zip || null,
      service_date: body.service_date || null,
      service_time: body.service_time || null,
      region_city: body.region_city || null,
      region_state: body.region_state || null,
      notes: body.notes || null,
      total_amount: totalFinal,
      created_by: user.id,
      // Novos campos PDF Jessica 10/07 (loja preenche no form)
      service_type: body.service_type
        ? String(body.service_type).slice(0, 500)
        : null,
      total_area_m2:
        typeof body.total_area_m2 === "number" && body.total_area_m2 >= 0
          ? body.total_area_m2
          : null,
      rooms: body.rooms ? String(body.rooms).slice(0, 500) : null,
      technical_responsible: body.technical_responsible
        ? String(body.technical_responsible).slice(0, 200)
        : null,
      technicians_count:
        typeof body.technicians_count === "number" && body.technicians_count > 0
          ? Math.floor(body.technicians_count)
          : null,
      material_description: body.material_description
        ? String(body.material_description).slice(0, 2000)
        : null,
      warranty_months:
        typeof body.warranty_months === "number" && body.warranty_months >= 0
          ? Math.floor(body.warranty_months)
          : null,
      execution_start_date: body.execution_start_date || null,
      scope_items: Array.isArray(body.scope_items)
        ? body.scope_items
            .map((s: unknown) => String(s ?? "").trim())
            .filter((s: string) => s.length > 0 && s.length <= 200)
            .slice(0, 30)
        : [],
      important_notes: body.important_notes
        ? String(body.important_notes).slice(0, 2000)
        : null,
      general_notes: body.general_notes
        ? String(body.general_notes).slice(0, 2000)
        : null,
      // Anexos Jessica 16/07
      project_files: Array.isArray(body.project_files) ? body.project_files : [],
      material_files: Array.isArray(body.material_files) ? body.material_files : [],
      // Jessica 03/08: opt-in fim de semana
      allow_weekend: !!body.allow_weekend,
    };

    if (calc) {
      Object.assign(insertPayload, {
        subtotal_services: calc.subtotal_services,
        travel_distance_km: calc.travel_distance_km,
        travel_cost: calc.travel_cost,
        stay_count: calc.stay_count,
        stay_cost: calc.stay_cost,
        is_special_hour: calc.is_special_hour,
        special_hour_extra: calc.special_hour_extra,
        total_hours: calc.total_hours,
        total_days: calc.total_days,
        platform_fee_pct: calc.platform_fee_pct,
        platform_fee_amount: calc.platform_fee_amount,
        payout_amount: calc.payout_amount,
        // Warnings persistidos (transparencia Jessica 16/07)
        calculator_warnings: (calc as { warnings?: string[] }).warnings ?? [],
      });
    }

    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .insert(insertPayload)
      .select()
      .single();

    if (quoteErr || !quote) {
      console.error(`Failed to create quote: ${quoteErr?.message}`);
      throw new Error("Falha ao criar o orçamento");
    }

    const { error: itemsErr } = await supabase
      .from("quote_items")
      .insert(itemRows.map((r) => ({ quote_id: quote.id, ...r })));

    if (itemsErr) {
      await supabase.from("quotes").delete().eq("id", quote.id);
      throw new Error("Falha ao salvar os itens do orçamento");
    }

    logAudit({
      userId: user.id,
      action: "quote.created",
      entityType: "quote",
      entityId: quote.id,
      newData: { partner_id: partnerId, total_amount: quote.total_amount },
    });

    return jsonResponse(quote, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
