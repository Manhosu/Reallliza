import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "@/lib/api-helpers/auth";
import {
  sincronizarBotoes,
  sincronizarEnquete,
  validarAnexos,
  type BotaoDeAcao,
  type EnquetePedida,
} from "@/lib/feed/anexos";

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
