import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { authenticateApiKey } from "@/lib/api-helpers/api-key-auth";

export const maxDuration = 60;

/**
 * Envio em massa da notificação de publicação.
 *
 * O caminho anterior fazia uma chamada por destinatário, dentro da requisição
 * de publicar, numa promessa que a plataforma encerrava no retorno — a maior
 * parte dos envios morria em silêncio.
 *
 * Aqui: as notificações internas nascem numa consulta só, e o envio ao serviço
 * de push vai em lotes de 100 (o teto do provedor), com posição salva. Um
 * trabalho grande atravessa várias execuções em vez de estourar o tempo.
 */

const LOTE_PUSH = 100;
const TETO_POR_EXECUCAO = 1500;
const EXPO = "https://exp.host/--/api/v2/push/send";

export async function GET(request: NextRequest) {
  try {
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

    const { data: job } = await supabase
      .from("feed_notification_jobs")
      .select("id, post_id, status, cursor_token, notifications_created, push_sent, push_failed, attempts")
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!job) return jsonResponse({ nada_na_fila: true });

    const { data: post } = await supabase
      .from("feed_posts")
      .select("id, title, content, author_id, audience_rule_id, notification_title, notification_body, notified_at")
      .eq("id", job.post_id)
      .maybeSingle();

    if (!post) {
      await supabase
        .from("feed_notification_jobs")
        .update({ status: "failed", last_error: "Publicação não existe mais", finished_at: new Date().toISOString() })
        .eq("id", job.id);
      return jsonResponse({ job: job.id, status: "failed" });
    }

    const titulo = post.notification_title || post.title;
    const corpo =
      post.notification_body || String(post.content).slice(0, 140).replace(/\s+/g, " ");

    // Primeira passada: cria as notificações internas de uma vez.
    let criadas = job.notifications_created;
    if (job.status === "pending") {
      await supabase
        .from("feed_notification_jobs")
        .update({ status: "running", started_at: new Date().toISOString(), attempts: job.attempts + 1 })
        .eq("id", job.id);

      const { data: qtd, error: errNot } = await supabase.rpc("feed_criar_notificacoes", {
        p_post: post.id,
        p_titulo: titulo,
        p_corpo: corpo,
        p_autor: post.author_id,
      });
      if (errNot) {
        await supabase
          .from("feed_notification_jobs")
          .update({ status: "failed", last_error: errNot.message })
          .eq("id", job.id);
        return jsonResponse({ job: job.id, erro: errNot.message }, 500);
      }
      criadas = Number(qtd ?? 0);
      await supabase
        .from("feed_notification_jobs")
        .update({ notifications_created: criadas, total_recipients: criadas })
        .eq("id", job.id);
    }

    // Segunda parte: push em lote, retomando de onde parou.
    const desde = job.cursor_token ?? "";
    const regra = post.audience_rule_id;
    const REGRA_TODOS = "00000000-0000-0000-0000-0000000000a1";

    let consulta = supabase
      .from("device_tokens")
      .select("id, token, user_id")
      .order("id", { ascending: true })
      .limit(TETO_POR_EXECUCAO);
    if (desde) consulta = consulta.gt("id", desde);

    const { data: aparelhos } = await consulta;
    let alvos = (aparelhos ?? []) as Array<{ id: string; token: string; user_id: string }>;

    // Filtra pela audiência quando há segmentação.
    if (regra && regra !== REGRA_TODOS && alvos.length > 0) {
      const { data: membros } = await supabase
        .from("feed_audience_members")
        .select("user_id")
        .eq("rule_id", regra)
        .in("user_id", alvos.map((a) => a.user_id));
      const permitidos = new Set(
        ((membros ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
      );
      alvos = alvos.filter((a) => permitidos.has(a.user_id));
    }

    let enviados = job.push_sent;
    let falhas = job.push_failed;

    for (let i = 0; i < alvos.length; i += LOTE_PUSH) {
      const lote = alvos.slice(i, i + LOTE_PUSH);
      try {
        const r = await fetch(EXPO, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(
            lote.map((a) => ({
              to: a.token,
              title: titulo,
              body: corpo,
              sound: "default",
              // Carga pequena de propósito: o iOS descarta silenciosamente
              // notificação com mais de 4 KB.
              data: { feed_post_id: post.id },
            }))
          ),
        });
        if (r.ok) enviados += lote.length;
        else falhas += lote.length;
      } catch {
        falhas += lote.length;
      }
    }

    const ultimoId = aparelhos?.length ? aparelhos[aparelhos.length - 1].id : null;
    const acabou = !aparelhos || aparelhos.length < TETO_POR_EXECUCAO;

    await supabase
      .from("feed_notification_jobs")
      .update({
        status: acabou ? "done" : "running",
        cursor_token: ultimoId,
        push_sent: enviados,
        push_failed: falhas,
        finished_at: acabou ? new Date().toISOString() : null,
      })
      .eq("id", job.id);

    if (acabou) {
      await supabase
        .from("feed_posts")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", post.id);
    }

    return jsonResponse({
      job: job.id,
      publicacao: post.id,
      notificacoes_internas: criadas,
      push_enviados: enviados,
      push_falhos: falhas,
      concluido: acabou,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
