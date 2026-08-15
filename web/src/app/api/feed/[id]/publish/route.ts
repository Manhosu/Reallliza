import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { resolverAudiencia } from "@/lib/feed/audience";

/**
 * POST /api/feed/[id]/publish
 *
 * Publica ou agenda. Publicar é ato separado de salvar porque dispara duas
 * coisas com efeito no mundo: resolve a audiência e, se pedido, enfileira
 * notificação para todo o público.
 *
 * A notificação apenas ENTRA NA FILA aqui. Mandar em linha significaria uma
 * chamada por destinatário dentro da requisição — que é o que a versão
 * anterior fazia, e a função era encerrada antes de terminar o laço, perdendo
 * a maior parte dos envios em silêncio.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = getAdminClient();

    const { data: post, error } = await supabase
      .from("feed_posts")
      .select("id, title, status, audience_rule_id, notify_on_publish, notification_title, notification_body, publish_at")
      .eq("id", id)
      .maybeSingle();

    if (error || !post) throw new AuthError(404, "Publicação não encontrada");
    if (post.status === "archived") {
      throw new AuthError(400, "Publicação arquivada. Duplique para publicar de novo.");
    }

    // Publicação sem conteúdo visível seria uma linha em branco no feed.
    const { count: qtdMidia } = await supabase
      .from("feed_post_media")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id)
      .eq("status", "ready");

    const agendarPara: string | null = body.publish_at ?? post.publish_at ?? null;
    const agendado = !!agendarPara && new Date(agendarPara).getTime() > Date.now();

    // Resolve a audiência antes de publicar: publicar com audiência vazia
    // significaria conteúdo que ninguém vê, e é melhor descobrir agora.
    let alcance: number | null = null;
    if (post.audience_rule_id) {
      const r = await resolverAudiencia(supabase, post.audience_rule_id);
      alcance = r.total;
      if (alcance === 0) {
        throw new AuthError(
          400,
          "A audiência escolhida não alcança nenhuma pessoa hoje. Ajuste a segmentação antes de publicar."
        );
      }
    }

    const agora = new Date().toISOString();
    const { error: errUp } = await supabase
      .from("feed_posts")
      .update({
        status: agendado ? "scheduled" : "published",
        publish_at: agendado ? agendarPara : null,
        published_at: agendado ? null : agora,
        published_by: user.id,
      })
      .eq("id", id);

    if (errUp) throw new Error(`Falha ao publicar: ${errUp.message}`);

    // Notificação só quando publica de fato. Agendado enfileira na hora certa,
    // pelo cron.
    let jobId: string | null = null;
    if (!agendado && post.notify_on_publish) {
      const { data: job } = await supabase
        .from("feed_notification_jobs")
        .insert({ post_id: id, status: "pending" })
        .select("id")
        .single();
      jobId = job?.id ?? null;
    }

    logAudit({
      userId: user.id,
      action: agendado ? "feed_post.scheduled" : "feed_post.published",
      entityType: "feed_post",
      entityId: id,
      newData: { alcance, notificar: post.notify_on_publish, publish_at: agendarPara },
    });

    return jsonResponse({
      id,
      status: agendado ? "scheduled" : "published",
      publish_at: agendado ? agendarPara : null,
      audiencia_alcancada: alcance,
      midias: qtdMidia ?? 0,
      notificacao_enfileirada: jobId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/feed/[id]/publish — despublica (volta a rascunho).
 * Preferido a apagar: mantém histórico e métricas.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;
    const supabase = getAdminClient();

    const { error } = await supabase
      .from("feed_posts")
      .update({ status: "paused" })
      .eq("id", id);
    if (error) throw new Error(`Falha ao pausar: ${error.message}`);

    logAudit({
      userId: user.id,
      action: "feed_post.paused",
      entityType: "feed_post",
      entityId: id,
    });
    return jsonResponse({ id, status: "paused" });
  } catch (error) {
    return errorResponse(error);
  }
}
