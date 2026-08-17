import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { authenticateApiKey } from "@/lib/api-helpers/api-key-auth";
import { resolverAudiencia } from "@/lib/feed/audience";
import { ehChamadaDeRotina } from "@/lib/api-helpers/cron-auth";

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
 * Autentica pelo segredo do cron ou por chave de API — o mesmo padrão da
 * tarefa de reenvio de webhook, que já existia.
 */
async function executar(request: NextRequest) {
  if (!ehChamadaDeRotina(request)) {
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

  /**
   * 5. Recalcular as audiências.
   *
   * Sem esta etapa a audiência congelava no instante da publicação: quem se
   * homologava, mudava de estado ou concluía um curso depois disso nunca
   * entrava — nem saía, ao deixar de atender a regra. Uma campanha para
   * "homologados do Sudeste" continuava entregando à lista de semanas atrás.
   *
   * A função no banco só MARCA as regras (zera `computed_at`), porque o
   * predicado é compilado aqui na aplicação — guardar SQL no banco seria
   * injeção esperando acontecer. Quem materializa é `resolverAudiencia`.
   */
  await supabase.rpc("feed_recalcular_audiencias");

  /**
   * Além das marcadas, entram as que estão com a conta velha.
   *
   * A função no banco só marca públicos em uso por publicação ativa — o que
   * é razoável para a materialização. Mas o seletor do editor mostra o
   * tamanho de TODOS os públicos, inclusive os que ainda não foram usados, e
   * um número velho ali engana na hora de decidir a campanha. Seis horas é
   * folgado o bastante para não pesar e curto o bastante para o número não
   * envelhecer entre um dia de trabalho e outro.
   */
  const seisHorasAtras = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: paraRecalcular } = await supabase
    .from("feed_audience_rules")
    .select("id, name")
    .or(`computed_at.is.null,computed_at.lt.${seisHorasAtras}`)
    .limit(50);

  let recalculadas = 0;
  const falhas: string[] = [];
  for (const regra of paraRecalcular ?? []) {
    try {
      await resolverAudiencia(supabase, regra.id);
      recalculadas += 1;
    } catch (e) {
      // Uma regra inválida não pode impedir as outras de atualizar.
      falhas.push(`${regra.name}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  resultado.audiencias_recalculadas = recalculadas;
  if (falhas.length) resultado.audiencias_com_falha = falhas;

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
