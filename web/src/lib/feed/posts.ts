import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "@/lib/api-helpers/auth";
import {
  sincronizarBotoes,
  sincronizarEnquete,
  validarAnexos,
  type BotaoDeAcao,
  type EnquetePedida,
} from "@/lib/feed/anexos";
import { resolverAudiencia } from "@/lib/feed/audience";
import { garantirCampanhaLiberada } from "@/lib/feed/pricing";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * Criação de publicação — compartilhada entre `POST /api/feed` (avulsa) e
 * `POST /api/feed/campaigns` (campanha + peça no mesmo pedido). Duplicar essa
 * lógica nas duas rotas deixaria as validações divergirem com o tempo.
 */
export interface CorpoDeCriacaoDePost {
  title?: unknown;
  content?: unknown;
  status?: unknown;
  category_id?: unknown;
  campaign_id?: unknown;
  sponsor_id?: unknown;
  audience_rule_id?: unknown;
  publish_at?: unknown;
  unpublish_at?: unknown;
  pinned_until?: unknown;
  pin_priority?: unknown;
  notify_on_publish?: unknown;
  notification_title?: unknown;
  notification_body?: unknown;
  comments_enabled?: unknown;
  reactions_enabled?: unknown;
  duplicated_from?: unknown;
  ctas?: BotaoDeAcao[];
  poll?: EnquetePedida | null;
}

export async function criarPost(
  supabase: SupabaseClient,
  authorId: string,
  body: CorpoDeCriacaoDePost
) {
  if (!body.title || !String(body.title).trim()) {
    throw new AuthError(400, "Informe o título da publicação");
  }
  if (!body.content || !String(body.content).trim()) {
    throw new AuthError(400, "Informe o conteúdo da publicação");
  }

  const status = ["draft", "scheduled", "published"].includes(body.status as string)
    ? (body.status as string)
    : "draft";

  if (status === "scheduled" && !body.publish_at) {
    throw new AuthError(400, "Publicação agendada precisa de data e hora");
  }

  // Categoria de campanha exige patrocinador — senão o selo "Patrocinado"
  // não teria de quem falar.
  if (body.category_id) {
    const { data: cat } = await supabase
      .from("feed_categories")
      .select("requires_sponsor, name")
      .eq("id", body.category_id)
      .maybeSingle();
    if (cat?.requires_sponsor && !body.campaign_id && !body.sponsor_id) {
      throw new AuthError(
        400,
        `A categoria "${cat.name}" exige vincular um patrocinador ou campanha.`
      );
    }
  }

  // Antes de inserir qualquer coisa: botão ou enquete inválidos derrubariam
  // o pedido DEPOIS de a publicação já existir, deixando um rascunho órfão
  // que ninguém pediu.
  validarAnexos(body.ctas, body.poll);

  const payload: Record<string, unknown> = {
    author_id: authorId,
    title: String(body.title).trim(),
    content: String(body.content).trim(),
    status,
    category_id: body.category_id ?? null,
    campaign_id: body.campaign_id ?? null,
    sponsor_id: body.sponsor_id ?? null,
    audience_rule_id: body.audience_rule_id ?? null,
    publish_at: body.publish_at ?? null,
    unpublish_at: body.unpublish_at ?? null,
    pinned_until: body.pinned_until ?? null,
    pin_priority: Number(body.pin_priority) || 0,
    notify_on_publish: !!body.notify_on_publish,
    notification_title: body.notification_title ?? null,
    notification_body: body.notification_body ?? null,
    comments_enabled: body.comments_enabled !== false,
    reactions_enabled: body.reactions_enabled !== false,
    duplicated_from: body.duplicated_from ?? null,
    published_at: status === "published" ? new Date().toISOString() : null,
    published_by: status === "published" ? authorId : null,
    // A coluna antiga continua obrigatória no schema; o gatilho a mantém
    // coerente com `status`.
    is_published: status === "published",
    audience: "all",
  };

  const { data: post, error } = await supabase
    .from("feed_posts")
    .insert(payload)
    .select("*")
    .single();

  if (error || !post) {
    console.error(`Falha ao criar publicação: ${error?.message}`);
    throw new Error("Falha ao criar a publicação");
  }

  // Botões e enquete são gravados aqui, não em rota separada: publicação sem
  // o botão que ela deveria ter é uma peça de campanha incompleta no ar, e
  // ninguém percebe até a campanha render zero.
  const botoes = await sincronizarBotoes(supabase, post.id, body.ctas);
  const enquete = await sincronizarEnquete(supabase, post.id, body.poll);

  return { post, botoes, enquete };
}

export interface ResultadoDePublicacao {
  id: string;
  status: "scheduled" | "published";
  publish_at: string | null;
  audiencia_alcancada: number | null;
  midias: number;
  notificacao_enfileirada: string | null;
}

/**
 * Publica ou agenda uma publicação já existente — compartilhada entre o
 * clique manual (`POST /feed/[id]/publish`) e a auto-publicação ao aprovar
 * uma campanha (`POST /feed/campaigns/[id]/approve`). `publishAtOverride` só
 * existe pro clique manual (equivalente ao antigo `body.publish_at`); o
 * gatilho de aprovação não passa nada e a função cai no `publish_at` já
 * gravado no post — é isso que preserva o post agendado indo pra
 * "scheduled" em vez de publicar na hora.
 */
export async function publicarPost(
  supabase: SupabaseClient,
  postId: string,
  publishedByUserId: string,
  publishAtOverride?: string | null
): Promise<ResultadoDePublicacao> {
  const { data: post, error } = await supabase
    .from("feed_posts")
    .select("id, title, status, audience_rule_id, notify_on_publish, notification_title, notification_body, publish_at, campaign_id")
    .eq("id", postId)
    .maybeSingle();

  if (error || !post) throw new AuthError(404, "Publicação não encontrada");
  if (post.status === "archived") {
    throw new AuthError(400, "Publicação arquivada. Duplique para publicar de novo.");
  }

  // O portão de verdade: nenhuma peça de campanha vai ao ar sem pagamento
  // confirmado (ou isenção de conta-casa) e aprovação editorial. O PATCH de
  // status da campanha já checa isso, mas é aqui, no publish, que o
  // conteúdo de fato aparece pra alguém — a garantia tem que estar aqui
  // também, senão a UI errar significaria peça paga indo ao ar sem passar
  // pelo controle pedido.
  let campanha: {
    id: string; status: string; payment_status: string; approval_status: string; duration_days: number | null;
  } | null = null;
  if (post.campaign_id) {
    const { data: c } = await supabase
      .from("feed_campaigns")
      .select("id, status, payment_status, approval_status, duration_days")
      .eq("id", post.campaign_id)
      .maybeSingle();
    if (!c) throw new AuthError(404, "Campanha da publicação não encontrada");
    garantirCampanhaLiberada(c);
    campanha = c;
  }

  // Publicação sem conteúdo visível seria uma linha em branco no feed.
  const { count: qtdMidia } = await supabase
    .from("feed_post_media")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .eq("status", "ready");

  const agendarPara: string | null = publishAtOverride ?? post.publish_at ?? null;
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
      published_by: publishedByUserId,
    })
    .eq("id", postId);

  if (errUp) throw new Error(`Falha ao publicar: ${errUp.message}`);

  // Primeira publicação da campanha: é aqui que ela sai de "draft" e ganha
  // janela de veiculação. Publicações seguintes da mesma campanha não
  // reescrevem a janela já ativa.
  if (campanha && campanha.status === "draft") {
    const inicioDaJanela = agendado ? agendarPara! : agora;
    const fimDaJanela = campanha.duration_days
      ? new Date(
          new Date(inicioDaJanela).getTime() + campanha.duration_days * 24 * 60 * 60 * 1000
        ).toISOString()
      : null;
    await supabase
      .from("feed_campaigns")
      .update({
        status: agendado ? "scheduled" : "active",
        starts_at: inicioDaJanela,
        ends_at: fimDaJanela,
      })
      .eq("id", campanha.id);
  }

  // Notificação só quando publica de fato. Agendado enfileira na hora certa,
  // pelo cron.
  let jobId: string | null = null;
  if (!agendado && post.notify_on_publish) {
    const { data: job } = await supabase
      .from("feed_notification_jobs")
      .insert({ post_id: postId, status: "pending" })
      .select("id")
      .single();
    jobId = job?.id ?? null;
  }

  logAudit({
    userId: publishedByUserId,
    action: agendado ? "feed_post.scheduled" : "feed_post.published",
    entityType: "feed_post",
    entityId: postId,
    newData: { alcance, notificar: post.notify_on_publish, publish_at: agendarPara },
  });

  return {
    id: postId,
    status: agendado ? "scheduled" : "published",
    publish_at: agendado ? agendarPara : null,
    audiencia_alcancada: alcance,
    midias: qtdMidia ?? 0,
    notificacao_enfileirada: jobId,
  };
}
