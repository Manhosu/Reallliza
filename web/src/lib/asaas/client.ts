/**
 * Cliente Asaas — gateway de pagamento (PIX, boleto, cartão).
 * Marco 6 / Bloco 4. Portado do Garantias.
 *
 * Env vars:
 *   ASAAS_API_KEY       — chave da API Asaas
 *   ASAAS_ENV           — 'sandbox' (default) ou 'production'
 *   ASAAS_WEBHOOK_TOKEN — token para validar o webhook de confirmação
 *
 * Degradação graciosa: sem ASAAS_API_KEY, createCharge/createPixCharge
 * retornam null e o pagamento fica em modo "confirmação manual" (admin
 * confirma à mão).
 */

function getBaseUrl(): string {
  return process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

export function isAsaasConfigured(): boolean {
  return !!process.env.ASAAS_API_KEY;
}

interface DadosDoCliente {
  customerName: string;
  customerDocument?: string;
  customerEmail?: string;
}

/** Cria/recupera o cliente Asaas — passo comum a qualquer tipo de cobrança. */
async function criarClienteAsaas(
  apiKey: string,
  input: DadosDoCliente
): Promise<{ id: string }> {
  const res = await fetch(`${getBaseUrl()}/customers`, {
    method: "POST",
    headers: { access_token: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.customerName,
      cpfCnpj: input.customerDocument || "00000000000",
      email: input.customerEmail,
    }),
  });
  if (!res.ok) {
    throw new Error(`Asaas customer falhou: ${res.status}`);
  }
  return res.json();
}

export interface CreateChargeInput extends DadosDoCliente {
  amount: number;
  description: string;
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

  const customer = await criarClienteAsaas(apiKey, input);

  // UNDEFINED: o cliente escolhe PIX/boleto/cartão na página de checkout.
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

export interface CreatePixChargeInput extends DadosDoCliente {
  amount: number;
  description: string;
  externalReference: string;
}

export interface PixChargeResult {
  asaasId: string;
  checkoutUrl: string;
  /** `encodedImage` da Asaas — base64 puro do PNG, sem prefixo `data:`. */
  qrCodeBase64: string;
  /** `payload` da Asaas — a string EMV do "PIX copia e cola". */
  copiaCola: string;
  expiraEm: string | null;
}

/**
 * Cria uma cobrança PIX de verdade (não deixa o cliente escolher o método —
 * é sempre PIX) e já busca o QR Code + copia-e-cola na mesma chamada, pra
 * quem pediu a cobrança não precisar de uma segunda ida ao Asaas.
 * Retorna null se o Asaas não estiver configurado.
 */
export async function createPixCharge(
  input: CreatePixChargeInput
): Promise<PixChargeResult | null> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return null;

  const customer = await criarClienteAsaas(apiKey, input);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);
  const chargeRes = await fetch(`${getBaseUrl()}/payments`, {
    method: "POST",
    headers: { access_token: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: customer.id,
      billingType: "PIX",
      value: input.amount,
      dueDate: dueDate.toISOString().slice(0, 10),
      description: input.description,
      externalReference: input.externalReference,
    }),
  });
  if (!chargeRes.ok) {
    throw new Error(`Asaas payment (PIX) falhou: ${chargeRes.status}`);
  }
  const charge = (await chargeRes.json()) as { id: string; invoiceUrl: string };

  const qrRes = await fetch(`${getBaseUrl()}/payments/${charge.id}/pixQrCode`, {
    headers: { access_token: apiKey },
  });
  if (!qrRes.ok) {
    throw new Error(`Asaas pixQrCode falhou: ${qrRes.status}`);
  }
  const qr = (await qrRes.json()) as {
    encodedImage: string;
    payload: string;
    expirationDate: string | null;
  };

  return {
    asaasId: charge.id,
    checkoutUrl: charge.invoiceUrl,
    qrCodeBase64: qr.encodedImage,
    copiaCola: qr.payload,
    expiraEm: qr.expirationDate ?? null,
  };
}
