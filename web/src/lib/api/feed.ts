import { apiClient } from "./client";

export interface FeedMedia {
  id: string;
  position: number;
  kind: "image" | "video" | "document";
  public_url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  alt_text: string | null;
  caption: string | null;
  file_name: string | null;
  mime_type: string | null;
  byte_size: number | null;
  status?: "pending" | "ready" | "failed";
}

export interface FeedCta {
  id: string;
  position: number;
  cta_type: string;
  label: string;
  style: string;
  target_url: string | null;
  target_route: string | null;
  target_media_id: string | null;
  coupon_code: string | null;
}

export interface FeedCategoria {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  requires_sponsor?: boolean;
  default_notify?: boolean;
}

export interface FeedPost {
  id: string;
  title: string;
  content: string;
  status: "draft" | "scheduled" | "published" | "paused" | "archived";
  category_id: string | null;
  campaign_id: string | null;
  sponsor_id: string | null;
  audience_rule_id: string | null;
  is_sponsored: boolean;
  publish_at: string | null;
  published_at: string | null;
  unpublish_at: string | null;
  pinned_until: string | null;
  is_pinned: boolean;
  notify_on_publish: boolean;
  notification_title: string | null;
  notification_body: string | null;
  comments_enabled: boolean;
  reactions_enabled: boolean;
  like_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
  impression_count: number;
  unique_reach: number;
  click_count: number;
  created_at: string;
  author?: { id: string; full_name: string; avatar_url: string | null };
  category?: FeedCategoria | null;
  sponsor?: { id: string; name: string; logo_url: string | null; primary_color: string | null } | null;
  audience?: { id: string; name: string; estimated_size: number | null } | null;
  media?: FeedMedia[];
  ctas?: FeedCta[];
  my_reaction?: string | null;
  saved_by_me?: boolean;
}

export interface FeedMeta {
  categorias: FeedCategoria[];
  audiencias: Array<{ id: string; name: string; description: string | null; estimated_size: number | null }>;
  patrocinadores: Array<{ id: string; name: string; logo_url: string | null; primary_color: string | null }>;
  campanhas: Array<{ id: string; name: string; status: string; sponsor_id: string }>;
}

export interface FeedInsights {
  publicacao: { id: string; title: string; published_at: string | null };
  totais: {
    impressoes: number; alcance_unico: number; frequencia: number;
    visualizacoes: number; reacoes: number; comentarios: number;
    compartilhamentos: number; salvamentos: number; votos_enquete: number;
    cliques: number; downloads: number;
    ctr_impressao: number; ctr_alcance: number; taxa_engajamento: number;
    video: { inicios: number; q25: number; q50: number; q75: number; completos: number; tempo_medio_ms: number };
  };
  evolucao_diaria: Array<Record<string, number | string>>;
  recortes: Record<string, Array<{ valor: string; impressoes: number; cliques: number }>>;
}

export const feedApi = {
  list: (params?: { cursor?: string; limit?: number; include_drafts?: boolean; category_id?: string }) =>
    apiClient.get<{ data: FeedPost[]; next_cursor: string | null; has_more: boolean }>(
      "/feed",
      params as Record<string, unknown>
    ),

  getById: (id: string) => apiClient.get<FeedPost>(`/feed/${id}`),

  meta: () => apiClient.get<FeedMeta>("/feed/meta"),

  create: (payload: Partial<FeedPost>) => apiClient.post<FeedPost>("/feed", payload),

  update: (id: string, payload: Partial<FeedPost>) =>
    apiClient.patch<FeedPost>(`/feed/${id}`, payload),

  remove: (id: string) => apiClient.delete<{ success: true; arquivado: boolean }>(`/feed/${id}`),

  publish: (id: string, publish_at?: string | null) =>
    apiClient.post<{
      id: string; status: string; publish_at: string | null;
      audiencia_alcancada: number | null; midias: number;
    }>(`/feed/${id}/publish`, { publish_at: publish_at ?? null }),

  pause: (id: string) => apiClient.delete<{ id: string; status: string }>(`/feed/${id}/publish`),

  insights: (id: string) => apiClient.get<FeedInsights>(`/feed/${id}/insights`),

  react: (id: string, reaction: string | null) =>
    apiClient.post<{ my_reaction: string | null; like_count: number }>(`/feed/${id}/react`, { reaction }),

  save: (id: string) => apiClient.post<{ saved: boolean; save_count: number }>(`/feed/${id}/save`, {}),

  /**
   * Envia o arquivo DIRETO ao armazenamento, com URL assinada.
   *
   * O caminho anterior mandava tudo pela função do servidor, que na
   * plataforma tem limite de poucos megabytes no corpo — nenhum vídeo
   * chegava a subir.
   */
  async uploadMedia(
    postId: string,
    file: File,
    extras?: { width?: number; height?: number; duration_seconds?: number; alt_text?: string }
  ): Promise<FeedMedia> {
    const assinatura = await apiClient.post<{
      media_id: string; path: string; token: string; bucket: string;
    }>("/feed/media/sign", {
      post_id: postId,
      mime_type: file.type,
      byte_size: file.size,
      file_name: file.name,
    });

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(assinatura.bucket)
      .uploadToSignedUrl(assinatura.path, assinatura.token, file);

    if (error) throw new Error(`Falha ao enviar o arquivo: ${error.message}`);

    return apiClient.patch<FeedMedia>(`/feed/media/${assinatura.media_id}`, extras ?? {});
  },

  removeMedia: (mediaId: string) =>
    apiClient.delete<{ success: true }>(`/feed/media/${mediaId}`),
};
