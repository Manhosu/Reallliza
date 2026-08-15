import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { authenticateApiKey } from "@/lib/api-helpers/api-key-auth";

// A agregação roda dentro do banco; a função só dispara e espera. É o que
// mantém isto dentro do tempo de execução mesmo quando o volume crescer.
export const maxDuration = 60;

/**
 * GET|POST /api/feed/cron
 *
 * Tarefa periódica do Feed. Quatro trabalhos, todos idempotentes:
 *   1. publicar o que foi agendado e cuja hora chegou
 *   2. arquivar o que passou da data de fim, e soltar fixação vencida
 *   3. agregar os eventos em métricas do dia
 *   4. reconciliar contadores tocados nas últimas 48 h
 *
 * Autentica pelo segredo do cron, pelo cabeçalho da plataforma, ou por chave
 * de API — o mesmo padrão da tarefa de reenvio de webhook, que já existia.
 */
async function executar(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const autorizado =
    (segredo && request.headers.get("authorization") === `Bearer ${segredo}`) ||
    request.headers.get("x-vercel-cron") !== null;

  if (!autorizado) {
    try {
      await authenticateApiKey(request);
    } catch {
      return jsonResponse({ message: "Não autorizado" }, 401);
    }
  }

  const supabase = getAdminClient();
  const resultado: Record<string, unknown> = {};

  // 1. Agendados cuja hora chegou.
  const { data: publicados, error: errPub } = await supabase.rpc("feed_publicar_agendados");
  if (errPub) resultado.erro_publicacao = errPub.message;
  const lista = (publicados ?? []) as Array<{ post_id: string; notificar: boolean }>;
  resultado.publicados = lista.length;

  // Publicação agendada com aviso entra na fila agora, não na hora de salvar.
  const paraNotificar = lista.filter((p) => p.notificar);
  if (paraNotificar.length > 0) {
    await supabase.from("feed_notification_jobs").insert(
      paraNotificar.map((p) => ({ post_id: p.post_id, status: "pending" }))
    );
    resultado.notificacoes_enfileiradas = paraNotificar.length;
  }

  // 2. Vencidos e fixações expiradas.
  const { data: encerrados } = await supabase.rpc("feed_encerrar_vencidos");
  resultado.encerrados = encerrados ?? 0;

  // 3. Agregação de métricas.
  const { data: agregado, error: errAgg } = await supabase.rpc("feed_agregar");
  if (errAgg) {
    resultado.erro_agregacao = errAgg.message;
    await supabase
      .from("feed_rollup_state")
      .update({ last_error: errAgg.message, last_run_at: new Date().toISOString() })
      .eq("job_name", "feed_rollup");
  } else {
    resultado.linhas_agregadas = Array.isArray(agregado)
      ? (agregado[0] as { linhas_processadas?: number })?.linhas_processadas ?? 0
      : agregado;
  }

  // 4. Rede de segurança dos contadores derivados.
  const { data: reconciliados } = await supabase.rpc("feed_reconciliar_contadores", {
    p_desde: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
  });
  resultado.contadores_reconciliados = reconciliados ?? 0;

  return jsonResponse(resultado);
}

export async function GET(request: NextRequest) {
  try {
    return await executar(request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return await executar(request);
  } catch (error) {
    return errorResponse(error);
  }
}
