import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { issueNfe } from "@/lib/nfe/client";

/**
 * POST /api/invoices/[id]/emit
 * Emite a NFe da fatura via provedor configurado (ASAAS_API_KEY etc).
 * Apenas admin. Idempotente: se ja foi emitida (issued), apenas retorna.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select(
        "*, service_order:service_orders(id, client_name, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip), quote:quotes!service_orders_quote_quote_id_fkey(client_document, client_email, client_phone)"
      )
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      throw new AuthError(404, "Fatura nao encontrada");
    }

    // Idempotencia
    if ((invoice as { nfe_status: string }).nfe_status === "issued") {
      return jsonResponse({
        success: true,
        already_issued: true,
        invoice,
      });
    }

    // Carrega quote vinculada pra pegar dados do cliente — fallback service_order
    const so = (invoice as { service_order?: Record<string, unknown> }).service_order ?? {};

    // Quote pode vir associada via service_orders.quote_id (caso modalidade)
    let clientDoc: string | null = null;
    let clientEmail: string | null = null;
    let clientPhone: string | null = null;

    if ((invoice as { service_order_id?: string }).service_order_id) {
      const { data: q } = await supabase
        .from("quotes")
        .select("client_document, client_email, client_phone")
        .eq("service_order_id", (invoice as { service_order_id: string }).service_order_id)
        .maybeSingle();
      if (q) {
        clientDoc = (q as { client_document: string | null }).client_document;
        clientEmail = (q as { client_email: string | null }).client_email;
        clientPhone = (q as { client_phone: string | null }).client_phone;
      }
    }

    const result = await issueNfe({
      invoice_id: (invoice as { id: string }).id,
      invoice_numero: (invoice as { numero: string }).numero,
      amount: Number((invoice as { amount: number }).amount),
      description:
        (invoice as { description: string | null }).description ??
        `Servicos referentes a OS`,
      service_order_id: (invoice as { service_order_id: string }).service_order_id,
      client_name: (so as { client_name?: string }).client_name ?? "",
      client_document: clientDoc,
      client_email: clientEmail,
      client_phone: clientPhone,
      client_address: {
        street: (so as { address_street?: string | null }).address_street ?? null,
        number: (so as { address_number?: string | null }).address_number ?? null,
        complement: (so as { address_complement?: string | null }).address_complement ?? null,
        neighborhood: (so as { address_neighborhood?: string | null }).address_neighborhood ?? null,
        city: (so as { address_city?: string | null }).address_city ?? null,
        state: (so as { address_state?: string | null }).address_state ?? null,
        zip: (so as { address_zip?: string | null }).address_zip ?? null,
      },
    });

    const update: Record<string, unknown> = {
      nfe_provider: result.provider,
      nfe_status: result.status,
    };
    if (result.external_id) update.nfe_external_id = result.external_id;
    if (result.chave_acesso) update.nfe_chave_acesso = result.chave_acesso;
    if (result.numero) update.nfe_numero = result.numero;
    if (result.serie) update.nfe_serie = result.serie;
    if (result.xml_url) update.nfe_xml_url = result.xml_url;
    if (result.pdf_url) update.nfe_pdf_url = result.pdf_url;
    if (result.status === "issued") update.nfe_emitted_at = new Date().toISOString();
    if (result.error_message) update.nfe_error_message = result.error_message;

    await supabase.from("invoices").update(update).eq("id", id);

    logAudit({
      userId: user.id,
      action: "invoice.nfe_emit_attempt",
      entityType: "invoice",
      entityId: id,
      newData: {
        success: result.ok,
        status: result.status,
        provider: result.provider,
        error: result.error_message,
      },
    });

    if (!result.ok) {
      throw new AuthError(400, result.error_message ?? "Falha na emissao");
    }

    return jsonResponse({ success: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
