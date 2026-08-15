import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * POST /api/feed/events
 *
 * Recebe um LOTE de eventos de consumo do feed.
 *
 * Um evento por requisição está fora de questão: um técnico rolando o feed
 * geraria trinta chamadas em vinte segundos, cada uma pagando autenticação —
 * que faz uma consulta de sessão mais uma de perfil. O cliente acumula e
 * envia em lote a cada dez segundos, ou ao sair da tela.
 *
 * A gravação e o enriquecimento com as dimensões acontecem dentro do banco,
 * numa função só. A rota é fina de propósito: é o que a mantém dentro do
 * tempo de execução disponível.
 *
 * Cada evento traz `client_event_id`, então reenvio depois de falha de rede
 * não duplica contagem.
 */

const TIPOS_ACEITOS = new Set([
  "impression", "view", "video_start", "video_q25", "video_q50",
  "video_q75", "video_complete", "video_watch", "click", "download",
  "poll_vote", "expand", "carousel_swipe", "link_open",
]);

const MAX_POR_LOTE = 200;

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json();
    const supabase = getAdminClient();

    const bruto = Array.isArray(body?.events) ? body.events : [];
    if (bruto.length === 0) return jsonResponse({ registrados: 0 });
    if (bruto.length > MAX_POR_LOTE) {
      return jsonResponse(
        { message: `Envie no máximo ${MAX_POR_LOTE} eventos por vez` },
        400
      );
    }

    // O user_id vem do token, nunca do corpo — senão qualquer um inflaria
    // a métrica de outra pessoa.
    const eventos = bruto
      .filter(
        (e: Record<string, unknown>) =>
          e && TIPOS_ACEITOS.has(String(e.event_type)) && e.post_id && e.client_event_id && e.session_id
      )
      .map((e: Record<string, unknown>) => ({
        client_event_id: e.client_event_id,
        post_id: e.post_id,
        user_id: user.id,
        event_type: e.event_type,
        media_id: e.media_id ?? null,
        cta_id: e.cta_id ?? null,
        session_id: e.session_id,
        value_num: typeof e.value_num === "number" ? e.value_num : null,
        occurred_at: e.occurred_at ?? new Date().toISOString(),
        platform: ["ios", "android", "web"].includes(String(e.platform))
          ? e.platform
          : null,
        app_version: e.app_version ?? null,
      }));

    if (eventos.length === 0) return jsonResponse({ registrados: 0, descartados: bruto.length });

    const { data, error } = await supabase.rpc("feed_registrar_eventos", {
      p_eventos: eventos,
    });

    if (error) {
      console.error(`Falha ao registrar eventos do feed: ${error.message}`);
      // Métrica perdida não pode derrubar a experiência de quem está usando.
      return jsonResponse({ registrados: 0, erro: true });
    }

    return jsonResponse({
      registrados: Number(data ?? 0),
      descartados: bruto.length - eventos.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
