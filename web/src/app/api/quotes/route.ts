import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import type { SupabaseClient } from "@supabase/supabase-js";

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

    // Busca os serviços do catálogo (preço comercial).
    const serviceIds = [
      ...new Set(
        (body.items as IncomingItem[])
          .map((it) => it.service_id)
          .filter((v): v is string => typeof v === "string")
      ),
    ];
    if (serviceIds.length === 0) {
      throw new AuthError(400, "Itens inválidos");
    }

    const { data: services } = await supabase
      .from("services")
      .select("id, name, unit, commercial_price, estimated_time_hours, is_active")
      .in("id", serviceIds);

    type SvcRow = {
      id: string;
      name: string;
      unit: string;
      commercial_price: number;
      estimated_time_hours: number;
      is_active: boolean;
    };
    const byId = new Map(
      ((services as SvcRow[] | null) || []).map((s) => [s.id, s])
    );

    const itemRows: Array<{
      service_id: string;
      service_name: string;
      unit: string | null;
      unit_price: number;
      quantity: number;
    }> = [];
    const calcItems: Array<{
      service_id: string;
      quantity: number;
      commercial_price: number;
      estimated_time_hours: number;
      unit?: string;
    }> = [];
    let subtotal_services = 0;

    for (const it of body.items as IncomingItem[]) {
      const svc = it.service_id ? byId.get(it.service_id) : undefined;
      if (!svc || !svc.is_active) {
        throw new AuthError(400, "Serviço inválido ou inativo no orçamento");
      }
      const quantity = Math.max(0, Number(it.quantity) || 0);
      if (quantity <= 0) continue;
      const unitPrice = Number(svc.commercial_price) || 0;
      subtotal_services += unitPrice * quantity;
      itemRows.push({
        service_id: svc.id,
        service_name: svc.name,
        unit: svc.unit ?? null,
        unit_price: unitPrice,
        quantity,
      });
      calcItems.push({
        service_id: svc.id,
        quantity,
        commercial_price: unitPrice,
        estimated_time_hours: Number(svc.estimated_time_hours) || 0,
        unit: svc.unit,
      });
    }

    if (itemRows.length === 0) {
      throw new AuthError(400, "Informe a quantidade dos serviços");
    }

    // Modalidade e calculo (Fase 2): se vier modality, calcula full breakdown.
    let modality: "reallliza" | "homologados" | null = null;
    if (body.modality === "reallliza" || body.modality === "homologados") {
      modality = body.modality;
    }

    // Cobertura UF (Jessica 24/06): plataforma vs Reallliza atendem sao
    // configuraveis. Bloqueia se UF nao coberta pela plataforma. Bloqueia
    // modalidade 'reallliza' se UF nao coberta pela Reallliza. Skip se
    // sem endereco (draft pre-selecao) — a validacao final acontece no
    // primeiro POST com endereco preenchido.
    const uf = body.address_state
      ? String(body.address_state).toUpperCase()
      : null;
    if (uf) {
      const { isStateAvailable } = await import("@/lib/quotes/uf-scope");
      const platformOk = await isStateAvailable(uf, "platform");
      if (!platformOk) {
        throw new AuthError(
          400,
          `A plataforma ainda nao opera em ${uf}. Contate o administrador.`
        );
      }
      if (modality === "reallliza") {
        const reallizaOk = await isStateAvailable(uf, "reallliza");
        if (!reallizaOk) {
          throw new AuthError(
            400,
            `Reallliza nao atende ${uf} diretamente. Escolha "Publicar pra homologados".`
          );
        }
      }
    }

    type CalcResult = {
      subtotal_services: number;
      total_hours: number;
      total_days: number;
      travel_distance_km: number;
      travel_cost: number;
      stay_count: number;
      stay_cost: number;
      is_special_hour: boolean;
      special_hour_extra: number;
      total_amount: number;
      platform_fee_pct: number;
      platform_fee_amount: number;
      payout_amount: number;
    };
    let calc: CalcResult | null = null;
    if (modality) {
      const { calculateQuote } = await import("@/lib/quotes/calculator");
      calc = await calculateQuote({
        modality,
        items: calcItems,
        service_address_zip: body.address_zip ?? null,
        service_address_city: body.address_city ?? null,
        service_address_state: body.address_state ?? null,
        service_address_street: body.address_street ?? null,
        service_date: body.service_date ?? null,
        service_time: body.service_time ?? null,
        manual_total_amount:
          typeof body.manual_total_amount === "number"
            ? body.manual_total_amount
            : null,
      });
    }

    // CPF/CNPJ: armazena so digitos
    const sanitizeDoc = (v: unknown) =>
      typeof v === "string" ? v.replace(/\D/g, "").slice(0, 14) : null;

    const totalFinal = calc
      ? calc.total_amount
      : Math.round(subtotal_services * 100) / 100;

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
