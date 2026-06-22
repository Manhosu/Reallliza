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
      .select("id, name, unit, commercial_price, is_active")
      .in("id", serviceIds);

    const byId = new Map(
      (services || []).map((s) => [s.id as string, s])
    );

    const itemRows: Array<{
      service_id: string;
      service_name: string;
      unit: string | null;
      unit_price: number;
      quantity: number;
    }> = [];
    let total = 0;

    for (const it of body.items as IncomingItem[]) {
      const svc = it.service_id ? byId.get(it.service_id) : undefined;
      if (!svc || !svc.is_active) {
        throw new AuthError(400, "Serviço inválido ou inativo no orçamento");
      }
      const quantity = Math.max(0, Number(it.quantity) || 0);
      if (quantity <= 0) continue;
      const unitPrice = Number(svc.commercial_price) || 0;
      total += unitPrice * quantity;
      itemRows.push({
        service_id: svc.id as string,
        service_name: svc.name as string,
        unit: (svc.unit as string) ?? null,
        unit_price: unitPrice,
        quantity,
      });
    }

    if (itemRows.length === 0) {
      throw new AuthError(400, "Informe a quantidade dos serviços");
    }

    // CPF/CNPJ: armazena so digitos (validacao de checksum fica no front por enquanto)
    const sanitizeDoc = (v: unknown) =>
      typeof v === "string" ? v.replace(/\D/g, "").slice(0, 14) : null;

    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .insert({
        partner_id: partnerId,
        status: "draft",
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
        notes: body.notes || null,
        total_amount: Math.round(total * 100) / 100,
        created_by: user.id,
      })
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
