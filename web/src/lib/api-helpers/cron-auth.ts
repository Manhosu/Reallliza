import type { NextRequest } from "next/server";

/**
 * Autenticação das rotinas periódicas.
 *
 * Todas as três rotinas do sistema aceitavam a simples PRESENÇA do cabeçalho
 * `x-vercel-cron`:
 *
 *     if (request.headers.get("x-vercel-cron")) return;   // liberado
 *
 * Qualquer cliente pode enviar esse cabeçalho. Numa rotina que publica
 * conteúdo agendado e dispara notificação para toda a base, isso é um gatilho
 * aberto na internet: bastava um `curl` com o cabeçalho para dar push em
 * todos os profissionais cadastrados.
 *
 * A Vercel envia `Authorization: Bearer ${CRON_SECRET}` automaticamente
 * quando a variável existe no projeto. É esse segredo que autentica; o
 * cabeçalho da plataforma passou a ser irrelevante.
 *
 * ATENÇÃO DE IMPLANTAÇÃO: sem `CRON_SECRET` configurada, as rotinas param.
 * Isso é deliberado — a alternativa seria manter o gatilho aberto —, mas
 * precisa ser conferido no ambiente antes de subir.
 */
export function ehChamadaDeRotina(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;

  if (!segredo) {
    console.error(
      "[cron] CRON_SECRET não está configurada. A rotina foi recusada por " +
        "segurança. Defina a variável no projeto para as rotinas voltarem a rodar."
    );
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${segredo}`;
}
