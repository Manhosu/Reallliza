import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Leitura do feed.
 *
 * Duas mudanças em relação à versão anterior, ambas por causa de defeito real:
 *
 * 1. Contadores vêm gravados na publicação, mantidos por gatilho. Antes a
 *    rota carregava TODAS as linhas de curtida e comentário dos posts da
 *    página e contava em JavaScript — com 2.000 usuários e 20 publicações
 *    isso seriam dezenas de milhares de linhas por rolagem.
 *
 * 2. Paginação por cursor, não por deslocamento. Publicar algo enquanto o
 *    usuário rola fazia a página seguinte repetir o último item da anterior.
 *    O cursor é (sort_key, id), que é único e estável.
 */

export interface CursorFeed {
  k: string; // sort_key como texto: BIGINT não cabe em number com segurança
  id: string;
}

export function decodificarCursor(bruto: string | null): CursorFeed | null {
  if (!bruto) return null;
  try {
    const j = JSON.parse(Buffer.from(bruto, "base64url").toString("utf8"));
    if (typeof j?.k === "string" && typeof j?.id === "string") return j;
    return null;
  } catch {
    return null;
  }
}

export function codificarCursor(c: CursorFeed): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

const CAMPOS_POST = `
  id, title, content, media_urls, audience, is_pinned, is_published,
  status, published_at, publish_at, pinned_until, sort_key,
  category_id, campaign_id, sponsor_id, is_sponsored,
  comments_enabled, reactions_enabled,
  like_count, comment_count, save_count, share_count, poll_vote_count,
  impression_count, unique_reach, click_count,
  created_at, updated_at, author_id,
  author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url),
  category:feed_categories(id, slug, name, icon, color),
  sponsor:feed_sponsors(id, name, logo_url, primary_color),
  media:feed_post_media!feed_post_media_post_id_fkey(id, position, kind, public_url, thumbnail_url, width, height, duration_seconds, alt_text, caption, file_name, mime_type, byte_size),
  ctas:feed_post_ctas!feed_post_ctas_post_id_fkey(id, position, cta_type, label, style, target_url, target_route, target_media_id, coupon_code),
  poll:feed_polls(id, question, allow_multiple, is_anonymous, show_results, closes_at, total_votes,
                  options:feed_poll_options(id, position, label, image_url, vote_count))
`;

export interface OpcoesFeed {
  limit: number;
  cursor: CursorFeed | null;
  categoria?: string | null;
  apenasSalvos?: boolean;
}

/**
 * Monta o feed visível para um usuário.
 *
 * A visibilidade repete o predicado da função `feed_pode_ver` do banco. São
 * duas cópias de propósito — aqui em SQL indexável, lá para a RLS — e um
 * teste compara os dois caminhos, senão divergem com o tempo.
 */
export async function lerFeed(
  supabase: SupabaseClient,
  userId: string,
  ehAdmin: boolean,
  opts: OpcoesFeed
) {
  // Audiências às quais o usuário pertence. Uma consulta, não uma por post.
  const { data: minhasRegras } = await supabase
    .from("feed_audience_members")
    .select("rule_id")
    .eq("user_id", userId);

  const regrasDoUsuario = new Set(
    ((minhasRegras ?? []) as Array<{ rule_id: string }>).map((r) => r.rule_id)
  );
  // A audiência "Todos" é semente e não materializa membro — todo mundo vê.
  const REGRA_TODOS = "00000000-0000-0000-0000-0000000000a1";

  let q = supabase
    .from("feed_posts")
    .select(CAMPOS_POST)
    .is("deleted_at", null)
    .order("sort_key", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit + 1); // +1 só para saber se há próxima página

  if (!ehAdmin) {
    q = q.eq("status", "published");
  }
  if (opts.categoria) {
    q = q.eq("category_id", opts.categoria);
  }
  if (opts.cursor) {
    // Chave composta: mesma sort_key desempata por id.
    q = q.or(
      `sort_key.lt.${opts.cursor.k},and(sort_key.eq.${opts.cursor.k},id.lt.${opts.cursor.id})`
    );
  }

  const { data, error } = await q;
  if (error) {
    console.error(`Falha ao ler o feed: ${error.message}`);
    throw new Error("Falha ao carregar o feed");
  }

  type Linha = Record<string, unknown> & {
    id: string;
    sort_key: number | string;
    audience_rule_id?: string | null;
    unpublish_at?: string | null;
  };

  const agora = Date.now();
  const visiveis = ((data ?? []) as unknown as Linha[]).filter((p) => {
    if (ehAdmin) return true;
    if (p.unpublish_at && new Date(String(p.unpublish_at)).getTime() <= agora) return false;
    const regra = p.audience_rule_id as string | null | undefined;
    if (!regra || regra === REGRA_TODOS) return true;
    return regrasDoUsuario.has(regra);
  });

  const temMais = visiveis.length > opts.limit;
  const pagina = temMais ? visiveis.slice(0, opts.limit) : visiveis;

  // Estado do usuário nas publicações da página: três consultas fixas,
  // independentemente do tamanho da página.
  const ids = pagina.map((p) => p.id);
  const [reacoes, salvos, votos] = ids.length
    ? await Promise.all([
        supabase.from("feed_post_likes").select("post_id, reaction").eq("user_id", userId).in("post_id", ids),
        supabase.from("feed_post_saves").select("post_id").eq("user_id", userId).in("post_id", ids),
        supabase.from("feed_poll_votes").select("poll_id, option_id").eq("user_id", userId),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const minhaReacao = new Map(
    ((reacoes.data ?? []) as Array<{ post_id: string; reaction: string }>).map((r) => [r.post_id, r.reaction])
  );
  const salvosSet = new Set(((salvos.data ?? []) as Array<{ post_id: string }>).map((s) => s.post_id));
  const meusVotos = new Map<string, string[]>();
  for (const v of (votos.data ?? []) as Array<{ poll_id: string; option_id: string }>) {
    meusVotos.set(v.poll_id, [...(meusVotos.get(v.poll_id) ?? []), v.option_id]);
  }

  const itens = pagina.map((p) => {
    const enquete = p.poll as { id?: string } | null;
    return {
      ...p,
      media: Array.isArray(p.media)
        ? [...(p.media as Array<{ position: number }>)].sort((a, b) => a.position - b.position)
        : [],
      ctas: Array.isArray(p.ctas)
        ? [...(p.ctas as Array<{ position: number }>)].sort((a, b) => a.position - b.position)
        : [],
      my_reaction: minhaReacao.get(p.id) ?? null,
      // Mantido para o app publicado, que lê este campo.
      liked_by_me: minhaReacao.has(p.id),
      saved_by_me: salvosSet.has(p.id),
      my_poll_votes: enquete?.id ? meusVotos.get(enquete.id) ?? [] : [],
    };
  });

  const ultimo = pagina[pagina.length - 1];
  return {
    data: itens,
    next_cursor:
      temMais && ultimo ? codificarCursor({ k: String(ultimo.sort_key), id: ultimo.id }) : null,
    has_more: temMais,
  };
}
