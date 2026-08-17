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
  poll?: FeedEnquete | null;
  /** Opções que ESTA pessoa marcou na enquete. */
  my_poll_votes?: string[];
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

/**
 * O que o editor ENVIA — diferente do que a API devolve.
 *
 * Na leitura, botão e enquete vêm com id, posição e contadores; na escrita
 * quem manda é o formulário, que não tem nada disso. Usar o mesmo tipo para
 * os dois lados obrigaria o editor a inventar ids.
 */
export interface EntradaDePublicacao extends Partial<Omit<FeedPost, "ctas" | "poll">> {
  ctas?: {
    cta_type: string;
    label: string;
    target_url?: string | null;
    target_route?: string | null;
    coupon_code?: string | null;
    style?: string;
  }[];
  poll?: {
    question: string;
    options: string[];
    allow_multiple?: boolean;
    is_anonymous?: boolean;
    show_results?: string;
    closes_at?: string | null;
  } | null;
}

export const feedApi = {
  list: (params?: { cursor?: string; limit?: number; include_drafts?: boolean; category_id?: string }) =>
    apiClient.get<{ data: FeedPost[]; next_cursor: string | null; has_more: boolean }>(
      "/feed",
      params as Record<string, unknown>
    ),

  getById: (id: string) => apiClient.get<FeedPost>(`/feed/${id}`),

  meta: () => apiClient.get<FeedMeta>("/feed/meta"),

  create: (payload: EntradaDePublicacao) => apiClient.post<FeedPost>("/feed", payload),

  update: (id: string, payload: EntradaDePublicacao) =>
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

  duplicate: (id: string) =>
    apiClient.post<{ id: string; title: string; midias: number; botoes: number; enquete: boolean }>(
      `/feed/${id}/duplicate`,
      {}
    ),

  votarEnquete: (pollId: string, opcoes: string[]) =>
    apiClient.post<{ votou: boolean; resultado: FeedEnquete | null }>(
      `/feed/polls/${pollId}/vote`,
      { option_ids: opcoes }
    ),
};

export interface FeedEnquete {
  id: string;
  question: string;
  allow_multiple: boolean;
  is_anonymous: boolean;
  show_results: string;
  closes_at: string | null;
  total_votes: number;
  unique_voters: number;
  options: { id: string; position: number; label: string; vote_count: number }[];
}

export interface PainelFeed {
  periodo: { dias: number; desde: string };
  totais: Record<string, number>;
  evolucao_diaria: Record<string, Record<string, number>>;
  destaques: Record<string, { id: string; title: string; valor: number; is_sponsored: boolean }[]>;
  campanhas_por_desempenho: {
    id: string; name: string; status: string;
    impressoes: number; cliques: number; leads: number;
  }[];
  por_categoria: { id: string; name: string; color: string | null; impressoes: number }[];
  acesso: { dia_semana: number; hora: number; eventos: number; pessoas: number }[];
}

export interface UfDoMapa {
  uf: string; nome: string; regiao: string;
  profissionais: number; alcancados: number;
  impressoes: number; interacoes: number;
}

export interface Patrocinador {
  id: string; name: string; legal_name: string | null; cnpj: string | null;
  sponsor_type: string; logo_url: string | null; website_url: string | null;
  primary_color: string | null; contact_name: string | null;
  contact_email: string | null; is_active: boolean;
  desempenho?: { impressoes: number; cliques: number };
  campanhas?: { total: number; ativas: number };
}

export interface Campanha {
  id: string; sponsor_id: string; name: string; objective: string | null;
  status: string; starts_at: string | null; ends_at: string | null;
  budget_cents: number | null; contract_ref: string | null;
  goal_impressions: number | null; goal_clicks: number | null; goal_leads: number | null;
  sponsor?: { id: string; name: string; logo_url: string | null; primary_color: string | null };
  entregue?: { impressoes: number; cliques: number; leads: number; conversoes: number };
  progresso?: { impressoes: number | null; cliques: number | null; leads: number | null };
}

export interface Lead {
  id: string; kind: string; name: string; email: string | null; phone: string | null;
  uf: string | null; city_name: string | null; message: string | null;
  status: string; created_at: string; converted_at: string | null; notes: string | null;
  post?: { id: string; title: string } | null;
  sponsor?: { id: string; name: string } | null;
  campaign?: { id: string; name: string } | null;
}

export interface Catalogos {
  rotulos: Record<string, string>;
  ufs: { uf: string; name: string; region: string }[];
  regioes: string[];
  tipos_de_piso: { id: string; name: string; family: string | null }[];
  certificacoes: { id: string; name: string; issuer: string | null }[];
  fabricantes: { id: string; name: string; logo_url: string | null }[];
  especialidades: { id: string; name: string }[];
  cursos: { id: string; title: string }[];
  parceiros: { id: string; company_name: string }[];
  equipes: { id: string; name: string }[];
  papeis: { valor: string; rotulo: string }[];
  tipos_profissionais: { valor: string; rotulo: string }[];
  niveis: { valor: string; rotulo: string }[];
  saude_do_cadastro: {
    perfis_ativos: number; com_uf: number; com_cidade: number;
    com_tipo_de_piso: number; com_certificacao: number;
    com_fabricante: number; aparelhos_registrados: number;
  } | null;
}

/** Campanhas, patrocinadores, leads, moderação e painel. */
export const feedGestaoApi = {
  painel: (dias = 30, sponsorId?: string) =>
    apiClient.get<PainelFeed>(
      `/feed/dashboard?dias=${dias}${sponsorId ? `&sponsor_id=${sponsorId}` : ""}`
    ),

  mapa: (dias = 30) => apiClient.get<{ ufs: UfDoMapa[] }>(`/feed/mapa?dias=${dias}`),

  catalogos: () => apiClient.get<Catalogos>("/feed/catalogos"),

  buscarCidade: (termo: string, uf?: string) =>
    apiClient.get<{ cidades: { ibge_code: string; name: string; uf: string }[] }>(
      `/feed/catalogos?cidade=${encodeURIComponent(termo)}${uf ? `&uf=${uf}` : ""}`
    ),

  criarNoCatalogo: (catalogo: "certificacao" | "fabricante" | "tipo_de_piso", dados: Record<string, unknown>) =>
    apiClient.post<{ id: string; name: string }>("/feed/catalogos", { catalogo, ...dados }),

  patrocinadores: () => apiClient.get<{ patrocinadores: Patrocinador[] }>("/feed/sponsors"),
  criarPatrocinador: (dados: Partial<Patrocinador>) =>
    apiClient.post<Patrocinador>("/feed/sponsors", dados),
  atualizarPatrocinador: (id: string, dados: Partial<Patrocinador>) =>
    apiClient.patch<Patrocinador>(`/feed/sponsors/${id}`, dados),
  removerPatrocinador: (id: string) =>
    apiClient.delete<{ desativado?: boolean; excluido?: boolean; motivo?: string }>(
      `/feed/sponsors/${id}`
    ),

  campanhas: (filtros?: { status?: string; sponsor_id?: string }) => {
    const p = new URLSearchParams();
    if (filtros?.status) p.set("status", filtros.status);
    if (filtros?.sponsor_id) p.set("sponsor_id", filtros.sponsor_id);
    const q = p.toString();
    return apiClient.get<{ campanhas: Campanha[] }>(`/feed/campaigns${q ? `?${q}` : ""}`);
  },
  criarCampanha: (dados: Record<string, unknown>) =>
    apiClient.post<Campanha>("/feed/campaigns", dados),
  atualizarCampanha: (id: string, dados: Record<string, unknown>) =>
    apiClient.patch<Campanha & { pecas_pausadas: number }>(`/feed/campaigns/${id}`, dados),
  removerCampanha: (id: string) =>
    apiClient.delete<{ arquivada?: boolean; excluida?: boolean; motivo?: string }>(
      `/feed/campaigns/${id}`
    ),

  leads: (filtros?: { status?: string; sponsor_id?: string; campaign_id?: string }) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros ?? {})) if (v) p.set(k, v);
    const q = p.toString();
    return apiClient.get<{
      leads: Lead[];
      resumo: { total: number; por_situacao: Record<string, number>; por_tipo: Record<string, number>; taxa_conversao: number };
    }>(`/feed/leads${q ? `?${q}` : ""}`);
  },
  atualizarLead: (id: string, dados: { status?: string; notes?: string }) =>
    apiClient.patch<Lead>("/feed/leads", { id, ...dados }),

  moderacao: (status = "open") =>
    apiClient.get<{
      fila: { comentario: Record<string, unknown>; denuncias: Record<string, unknown>[]; motivos: string[] }[];
      resumo: { abertas: number; resolvidas: number };
    }>(`/feed/moderation?status=${status}`),
  moderar: (comment_id: string, acao: "esconder" | "remover" | "liberar" | "arquivar") =>
    apiClient.patch<{ ok: true }>("/feed/moderation", { comment_id, acao }),

  /**
   * O relatório não passa pelo cliente de API porque não é JSON: é um arquivo
   * que o navegador precisa baixar com o nome certo.
   */
  urlRelatorio: (
    tipo: "publicacoes" | "campanhas" | "leads" | "recortes",
    filtros?: Record<string, string | number>
  ) => {
    const p = new URLSearchParams({ tipo });
    for (const [k, v] of Object.entries(filtros ?? {})) p.set(k, String(v));
    return `/api/feed/reports?${p.toString()}`;
  },
};
