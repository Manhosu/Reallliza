/**
 * Cliente Efí (Gerencianet) — envio de PIX via API.
 *
 * Investigado como alternativa/complemento à Asaas pro repasse automático
 * ao homologado quando a custódia de uma OS é liberada — a Asaas não tem
 * endpoint de transferência via API pra chave de terceiro na configuração
 * atual da conta (ver payout.ts). Testado contra o sandbox da Efí em
 * 16/09 com o certificado e credenciais de homologação fornecidos por
 * Jéssica/Ricardo: autenticação, consulta de saldo e o escopo `pix.send`
 * confirmados funcionando.
 *
 * Autenticação: OAuth client_credentials **+ certificado mTLS (.p12)** —
 * a Efí exige os dois, client id/secret sozinho não basta. Cada ambiente
 * (sandbox/produção) tem seu próprio certificado e par de credenciais,
 * não são intercambiáveis entre si.
 *
 * Env vars:
 *   EFI_ENV                 — 'sandbox' (default) ou 'production'
 *   EFI_CLIENT_ID            — Client ID do ambiente ativo
 *   EFI_CLIENT_SECRET        — Client Secret do ambiente ativo
 *   EFI_CERTIFICADO_BASE64   — o .p12 do ambiente ativo, em base64 (Vercel
 *                              não guarda arquivo binário em env var — o
 *                              .p12 é codificado em base64 e decodificado
 *                              em runtime)
 *   EFI_CERTIFICADO_SENHA    — senha do certificado (string vazia se não
 *                              tiver sido definida uma ao gerar)
 *   EFI_CHAVE_PIX_REMETENTE  — a chave PIX cadastrada na conta Efí, usada
 *                              como pagador em todo envio — a API só aceita
 *                              enviar a partir de uma chave que já pertença
 *                              à conta autenticada
 *
 * Degradação graciosa: sem essas env vars, as funções de consulta/envio
 * retornam null — mesmo padrão de isAsaasConfigured() em asaas/client.ts.
 *
 * IMPORTANTE — webhook ainda não implementado: enviarPix() só funciona se
 * a chave remetente já tiver um webhook associado do lado da Efí, e a Efí
 * exige mTLS de verdade (handshake de certificado, não só um token na URL)
 * no servidor que RECEBE o webhook — norma do Banco Central. Uma function
 * serverless da Vercel não consegue validar isso: a plataforma termina o
 * TLS antes do código da function rodar, descartando qualquer certificado
 * de cliente. Falta decidir onde hospedar esse receptor (ex: um Cloudflare
 * Worker com Client Certificates na frente, validando e repassando pra
 * esta aplicação; ou um servidor Node dedicado fora da Vercel) antes de
 * registrarWebhook() apontar pra uma URL de verdade.
 */

import https from "https";

function getBaseUrl(): string {
  return process.env.EFI_ENV === "production"
    ? "https://pix.api.efipay.com.br"
    : "https://pix-h.api.efipay.com.br";
}

export function isEfiConfigured(): boolean {
  return !!(
    process.env.EFI_CLIENT_ID &&
    process.env.EFI_CLIENT_SECRET &&
    process.env.EFI_CERTIFICADO_BASE64
  );
}

function getCertificado(): Buffer {
  return Buffer.from(process.env.EFI_CERTIFICADO_BASE64!, "base64");
}

/** Toda rota da API PIX da Efí exige o certificado mTLS anexado, não só a de token. */
function requisitar(
  path: string,
  method: string,
  body: unknown,
  token?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      const auth = Buffer.from(
        `${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`
      ).toString("base64");
      headers.Authorization = `Basic ${auth}`;
    }
    if (bodyStr) headers["Content-Length"] = String(Buffer.byteLength(bodyStr));

    const url = new URL(getBaseUrl() + path);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        pfx: getCertificado(),
        passphrase: process.env.EFI_CERTIFICADO_SENHA || "",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let tokenCache: { token: string; expiraEm: number } | null = null;

/** Busca (ou reaproveita) o token de acesso — expira em 1h; renovado com 60s de folga. */
async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiraEm > Date.now()) {
    return tokenCache.token;
  }
  const res = await requisitar("/oauth/token", "POST", { grant_type: "client_credentials" });
  if (res.status !== 200) {
    throw new Error(`Efí OAuth falhou: ${res.status} ${res.body.slice(0, 200)}`);
  }
  const data = JSON.parse(res.body) as { access_token: string; expiresIn: number };
  tokenCache = {
    token: data.access_token,
    expiraEm: Date.now() + (data.expiresIn - 60) * 1000,
  };
  return data.access_token;
}

export interface EfiSaldo {
  saldo: string;
}

/** Consulta o saldo da conta Efí — GET /v2/gn/saldo/. Retorna null se não configurada. */
export async function getSaldo(): Promise<EfiSaldo | null> {
  if (!isEfiConfigured()) return null;
  const token = await getAccessToken();
  const res = await requisitar("/v2/gn/saldo/", "GET", undefined, token);
  if (res.status !== 200) {
    throw new Error(`Efí saldo falhou: ${res.status} ${res.body.slice(0, 200)}`);
  }
  return JSON.parse(res.body) as EfiSaldo;
}

export interface EnviarPixInput {
  /** Identificador único do envio, definido por nós — chamada idempotente por esse id. */
  idEnvio: string;
  /** Valor em reais, string com 2 casas decimais (ex: "150.00"). */
  valor: string;
  /** Chave PIX de destino — do homologado recebendo o repasse. */
  chaveDestino: string;
  /** Texto livre mostrado pro recebedor. */
  descricao?: string;
}

export interface EnviarPixResult {
  e2eId: string;
  status: string;
}

/**
 * Envia um PIX — PUT /v3/gn/pix/:idEnvio. Usa a chave cadastrada na conta
 * (EFI_CHAVE_PIX_REMETENTE) como pagador. Exige que essa chave já tenha um
 * webhook associado do lado da Efí (ver aviso no topo do arquivo) — sem
 * isso a chamada falha mesmo com tudo mais configurado certo.
 * Retorna null se a Efí não estiver configurada.
 */
export async function enviarPix(input: EnviarPixInput): Promise<EnviarPixResult | null> {
  if (!isEfiConfigured()) return null;
  const chaveRemetente = process.env.EFI_CHAVE_PIX_REMETENTE;
  if (!chaveRemetente) {
    throw new Error("EFI_CHAVE_PIX_REMETENTE não configurada");
  }

  const token = await getAccessToken();
  const res = await requisitar(
    `/v3/gn/pix/${input.idEnvio}`,
    "PUT",
    {
      valor: input.valor,
      pagador: {
        chave: chaveRemetente,
        infoPagador: input.descricao || "Repasse Reallliza",
      },
      favorecido: { chave: input.chaveDestino },
    },
    token
  );

  if (res.status !== 200) {
    throw new Error(`Efí envio de PIX falhou: ${res.status} ${res.body.slice(0, 300)}`);
  }
  const data = JSON.parse(res.body) as { e2eId: string; status: string };
  return { e2eId: data.e2eId, status: data.status };
}

/**
 * Registra a URL de webhook pra uma chave — PUT /v2/webhook/:chave.
 * Não chamar ainda: a Efí recusa qualquer URL sem mTLS de verdade
 * configurado no servidor receptor (ver aviso no topo do arquivo) — falta
 * decidir e construir esse receptor antes de registrar uma URL real aqui.
 */
export async function registrarWebhook(webhookUrl: string): Promise<void> {
  if (!isEfiConfigured()) return;
  const chaveRemetente = process.env.EFI_CHAVE_PIX_REMETENTE;
  if (!chaveRemetente) {
    throw new Error("EFI_CHAVE_PIX_REMETENTE não configurada");
  }
  const token = await getAccessToken();
  const res = await requisitar(`/v2/webhook/${chaveRemetente}`, "PUT", { webhookUrl }, token);
  if (res.status !== 200 && res.status !== 204) {
    throw new Error(`Efí registro de webhook falhou: ${res.status} ${res.body.slice(0, 300)}`);
  }
}
