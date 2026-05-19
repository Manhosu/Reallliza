/**
 * Cliente Asaas — gateway de pagamento (PIX, boleto, cartão).
 * Marco 6 / Bloco 4. Portado do Garantias.
 *
 * Env vars:
 *   ASAAS_API_KEY       — chave da API Asaas
 *   ASAAS_ENV           — 'sandbox' (default) ou 'production'
 *   ASAAS_WEBHOOK_TOKEN — token para validar o webhook de confirmação
 *
 * Degradação graciosa: sem ASAAS_API_KEY, createCharge retorna null e o
 * pagamento fica em modo "confirmação manual" (admin confirma à mão).
 */

function getBaseUrl(): string {
  return process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

export function isAsaasConfigured(): boolean {
  return !!process.env.ASAAS_API_KEY;
}

export interface CreateChargeInput {
  amount: number;
  description: string;
  customerName: string;
  customerDocument?: string;
  customerEmail?: string;
  externalReference: string;
}

export interface ChargeResult {
  asaasId: string;
  checkoutUrl: string;
}

/**
 * Cria uma cobrança no Asaas e retorna o link de checkout (invoiceUrl).
 * Retorna null se o Asaas não estiver configurado.
 */
export async function createCharge(
  input: CreateChargeInput
): Promise<ChargeResult | null> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return null;

  // 1. Cria/recupera o cliente.
  const customerRes = await fetch(`${getBaseUrl()}/customers`, {
    method: "POST",
    headers: { access_token: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.customerName,
      cpfCnpj: input.customerDocument || "00000000000",
      email: input.customerEmail,
    }),
  });
  if (!customerRes.ok) {
    throw new Error(`Asaas customer falhou: ${customerRes.status}`);
  }
  const customer = (await customerRes.json()) as { id: string };

  // 2. Cria a cobrança — UNDEFINED: o cliente escolhe PIX/boleto/cartão.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);
  const chargeRes = await fetch(`${getBaseUrl()}/payments`, {
    method: "POST",
    headers: { access_token: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: input.amount,
      dueDate: dueDate.toISOString().slice(0, 10),
      description: input.description,
      externalReference: input.externalReference,
    }),
  });
  if (!chargeRes.ok) {
    throw new Error(`Asaas payment falhou: ${chargeRes.status}`);
  }
  const charge = (await chargeRes.json()) as {
    id: string;
    invoiceUrl: string;
  };

  return { asaasId: charge.id, checkoutUrl: charge.invoiceUrl };
}
