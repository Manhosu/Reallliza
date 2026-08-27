import { cache } from "react";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";

export interface PreviewPublicoDePost {
  found: boolean;
  id?: string;
  title?: string;
  excerpt?: string;
  image_url?: string | null;
  sponsor_name?: string | null;
  published_at?: string | null;
}

/**
 * Busca a prévia pública de um post do Feed — só título/resumo/capa de
 * publicações já no ar, nunca conteúdo completo nem rascunho/agendado/
 * pausado/arquivado (ver rota /api/public/feed-post/[id], que expõe o
 * mesmo resultado como JSON).
 *
 * Compartilhada entre a rota pública e a página `/feed/p/[id]` (que chama
 * isto tanto em generateMetadata quanto no corpo) — `cache()` do React
 * garante que as duas chamadas dentro do mesmo request viram uma consulta
 * só ao banco.
 */
export const buscarPreviewPublico = cache(
  async (id: string): Promise<PreviewPublicoDePost> => {
    const supabase = getAdminClient();

    const { data: post, error } = await supabase
      .from("feed_posts")
      .select(
        `
        id, title, content, published_at, is_sponsored,
        sponsor:feed_sponsors(name, logo_url),
        media:feed_post_media!feed_post_media_post_id_fkey(kind, public_url, thumbnail_url, position, status)
      `
      )
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();

    if (error || !post) return { found: false };

    const p = post as unknown as {
      id: string;
      title: string;
      content: string;
      published_at: string | null;
      is_sponsored: boolean;
      sponsor: { name: string; logo_url: string | null } | null;
      media: Array<{ kind: string; public_url: string | null; thumbnail_url: string | null; position: number; status: string }>;
    };

    const capa = (p.media ?? [])
      .filter((m) => m.status === "ready" && (m.public_url || m.thumbnail_url))
      .sort((a, b) => a.position - b.position)[0];

    const conteudo = p.content.trim();
    const excerpt = conteudo.slice(0, 180);

    return {
      found: true,
      id: p.id,
      title: p.title,
      excerpt: excerpt.length < conteudo.length ? `${excerpt}…` : excerpt,
      image_url: capa ? capa.thumbnail_url ?? capa.public_url : null,
      sponsor_name: p.is_sponsored ? p.sponsor?.name ?? null : null,
      published_at: p.published_at,
    };
  }
);
