/**
 * Cliente abstrato de NFe — provider-agnostic.
 *
 * Spec novosajustes.md F4.3: emissao automatica ao concluir/faturar OS.
 *
 * Providers suportados (escolhidos via env NFE_PROVIDER):
 *  - 'asaas' (default): usa a API NFe nativa do Asaas. Reusa ASAAS_API_KEY.
 *  - 'nfeio': nfe.io (futuro)
 *  - 'focofne': focoNFe (futuro)
 *
 * Sem chave configurada, fica em modo "preview": grava intenção no DB
 * com nfe_status='pending' e mensagem amigavel — admin emite manualmente
 * depois e anexa URL.
 */

export interface NfeIssueInput {
  invoice_id: string;
  invoice_numero: string;
  amount: number;
  description: string;
  service_order_id: string;
  // Cliente final (tomador)
  client_name: string;
  client_document: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
}

export interface NfeIssueResult {
  ok: boolean;
  provider: string;
  external_id?: string;
  chave_acesso?: string;
  numero?: string;
  serie?: string;
  xml_url?: string;
  pdf_url?: string;
  status: "issued" | "processing" | "error" | "pending";
  error_message?: string;
}

export function getNfeProvider(): string {
  return (process.env.NFE_PROVIDER ?? "asaas").toLowerCase();
}

export function isNfeConfigured(): boolean {
  const provider = getNfeProvider();
  if (provider === "asaas") return !!process.env.ASAAS_API_KEY;
  if (provider === "nfeio") return !!process.env.NFE_API_KEY;
  if (provider === "focofne") return !!process.env.NFE_API_KEY;
  return false;
}

function getAsaasBaseUrl(): string {
  return process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

/**
 * Emite NFe via Asaas. O Asaas tem endpoint /invoices que emite NFS-e
 * automaticamente quando integrado com a prefeitura.
 *
 * No sandbox, a emissao retorna mock — util pra validar o fluxo sem
 * gerar nota real. Em producao, requer a empresa estar cadastrada no
 * painel Asaas com certificado digital + integracao municipal.
 */
async function issueViaAsaas(input: NfeIssueInput): Promise<NfeIssueResult> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      provider: "asaas",
      status: "error",
      error_message: "ASAAS_API_KEY nao configurada",
    };
  }

  const baseUrl = getAsaasBaseUrl();

  // Payload simplificado da API de invoices do Asaas.
  // Doc: https://docs.asaas.com/reference/criar-nota-fiscal
  const body = {
    serviceDescription: input.description.slice(0, 1000),
    value: input.amount,
    externalReference: input.invoice_id,
    deductions: 0,
    municipalServiceCode: "0107", // Codigo generico — admin pode ajustar depois
    observations: `Fatura ${input.invoice_numero} — OS ${input.service_order_id.slice(0, 8)}`,
    customer: {
      name: input.client_name,
      cpfCnpj: input.client_document ?? "",
      email: input.client_email ?? undefined,
      phone: input.client_phone ?? undefined,
      address: input.client_address.street ?? undefined,
      addressNumber: input.client_address.number ?? undefined,
      complement: input.client_address.complement ?? undefined,
      province: input.client_address.neighborhood ?? undefined,
      city: input.client_address.city ?? undefined,
      state: input.client_address.state ?? undefined,
      postalCode: input.client_address.zip?.replace(/\D/g, "") ?? undefined,
    },
  };

  try {
    const res = await fetch(`${baseUrl}/invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      number?: string;
      serie?: string;
      accessKey?: string;
      pdfUrl?: string;
      xmlUrl?: string;
      status?: string;
      errors?: Array<{ code?: string; description?: string }>;
    };

    if (!res.ok) {
      const errMsg =
        data.errors?.map((e) => e.description).filter(Boolean).join("; ") ||
        `HTTP ${res.status}`;
      return {
        ok: false,
        provider: "asaas",
        status: "error",
        error_message: errMsg.slice(0, 500),
      };
    }

    // Status do Asaas: SCHEDULED, AUTHORIZED, PROCESSING_CANCELLATION, CANCELED, etc
    const upper = (data.status ?? "").toUpperCase();
    const mapped: NfeIssueResult["status"] =
      upper === "AUTHORIZED" ? "issued"
        : upper === "PROCESSING" || upper === "SCHEDULED" ? "processing"
        : upper === "CANCELED" ? "error"
        : "processing";

    return {
      ok: true,
      provider: "asaas",
      external_id: data.id,
      chave_acesso: data.accessKey,
      numero: data.number,
      serie: data.serie,
      xml_url: data.xmlUrl,
      pdf_url: data.pdfUrl,
      status: mapped,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "asaas",
      status: "error",
      error_message: err instanceof Error ? err.message.slice(0, 500) : "unknown",
    };
  }
}

export async function issueNfe(input: NfeIssueInput): Promise<NfeIssueResult> {
  const provider = getNfeProvider();
  if (!isNfeConfigured()) {
    return {
      ok: false,
      provider,
      status: "error",
      error_message:
        "Provedor NFe nao configurado. Configure ASAAS_API_KEY (ou NFE_API_KEY) no Vercel.",
    };
  }
  if (provider === "asaas") return issueViaAsaas(input);
  return {
    ok: false,
    provider,
    status: "error",
    error_message: `Provider '${provider}' nao implementado ainda.`,
  };
}

export async function cancelNfe(externalId: string): Promise<{
  ok: boolean;
  error_message?: string;
}> {
  const provider = getNfeProvider();
  if (provider !== "asaas") {
    return {
      ok: false,
      error_message: `Provider '${provider}' nao implementado ainda.`,
    };
  }
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return { ok: false, error_message: "ASAAS_API_KEY nao configurada" };
  }
  const baseUrl = getAsaasBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/invoices/${externalId}/cancel`, {
      method: "POST",
      headers: { access_token: apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error_message: text.slice(0, 500) };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error_message: err instanceof Error ? err.message : "unknown",
    };
  }
}
