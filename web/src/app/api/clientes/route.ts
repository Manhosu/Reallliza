import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/clientes
 * Lista clientes distintos da loja (agregacao das quotes do partner).
 * Cada cliente vem com contagem de quotes/OSs + ultima atividade.
 *
 * Considera "cliente unico" por (client_name + client_document) — se a
 * loja registrou variacoes do nome com o mesmo CPF, agrega. Sem documento,
 * cai pra (client_name + client_phone).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const supabase = getAdminClient();

    let partnerId: string | null = null;
    if (user.role === "partner") {
      const { data: p } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      partnerId = (p as { id?: string } | null)?.id ?? null;
      if (!partnerId) {
        throw new AuthError(404, "Parceiro nao encontrado");
      }
    } else if (user.role !== "admin") {
      throw new AuthError(403, "Sem permissao");
    }

    let query = supabase
      .from("quotes")
      .select(
        "id, client_name, client_document, client_phone, client_whatsapp, " +
          "client_email, address_city, address_state, address_zip, " +
          "address_street, address_number, address_neighborhood, " +
          "total_amount, created_at, status, service_order_id, modality"
      )
      .order("created_at", { ascending: false });

    if (partnerId) query = query.eq("partner_id", partnerId);

    const { data: quotes, error } = await query;
    if (error) {
      throw new Error("Falha ao listar quotes");
    }

    type Row = {
      id: string;
      client_name: string;
      client_document: string | null;
      client_phone: string | null;
      client_whatsapp: string | null;
      client_email: string | null;
      address_city: string | null;
      address_state: string | null;
      address_zip: string | null;
      address_street: string | null;
      address_number: string | null;
      address_neighborhood: string | null;
      total_amount: number;
      created_at: string;
      status: string;
      service_order_id: string | null;
      modality: string | null;
    };

    const map = new Map<
      string,
      {
        key: string;
        name: string;
        document: string | null;
        phone: string | null;
        whatsapp: string | null;
        email: string | null;
        last_address: {
          street: string | null;
          number: string | null;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
        };
        quotes_count: number;
        os_count: number;
        total_amount: number;
        last_activity_at: string;
        last_quote_id: string;
      }
    >();

    for (const r of ((quotes as unknown) as Row[] | null) ?? []) {
      const docKey = r.client_document || "";
      const phoneKey = r.client_phone || r.client_whatsapp || "";
      const key = `${(r.client_name || "").trim().toLowerCase()}|${docKey || phoneKey}`;
      const existing = map.get(key);
      if (existing) {
        existing.quotes_count += 1;
        if (r.service_order_id) existing.os_count += 1;
        existing.total_amount += Number(r.total_amount) || 0;
        // last_activity_at fica com o primeiro (ja ordenado desc)
      } else {
        map.set(key, {
          key,
          name: r.client_name,
          document: r.client_document,
          phone: r.client_phone,
          whatsapp: r.client_whatsapp,
          email: r.client_email,
          last_address: {
            street: r.address_street,
            number: r.address_number,
            neighborhood: r.address_neighborhood,
            city: r.address_city,
            state: r.address_state,
            zip: r.address_zip,
          },
          quotes_count: 1,
          os_count: r.service_order_id ? 1 : 0,
          total_amount: Number(r.total_amount) || 0,
          last_activity_at: r.created_at,
          last_quote_id: r.id,
        });
      }
    }

    const clients = Array.from(map.values()).sort((a, b) =>
      b.last_activity_at.localeCompare(a.last_activity_at)
    );

    return jsonResponse({ count: clients.length, clients });
  } catch (error) {
    return errorResponse(error);
  }
}
