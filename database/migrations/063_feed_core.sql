-- ============================================
-- Migration 063: Núcleo do Feed nativo
-- ============================================
-- Categorias, patrocinadores, campanhas, ciclo de vida do post e mídia
-- estruturada.
--
-- Decisão: ESTENDER `feed_posts`, não criar uma tabela nova. Ela já tem duas
-- FKs apontando para si (curtidas e comentários), RLS escrita, e é consumida
-- pelo app publicado nas lojas. Substituir forçaria re-apontar FKs, reescrever
-- policies e coordenar deploy de banco com atualização de app. O ganho seria
-- cosmético.
--
-- A tabela está VAZIA em produção (0 publicações), então não há dado a migrar
-- — o que remove o maior risco desta reconstrução.

-- ---------------------------------------------------------------
-- Categorias — tabela, não ENUM.
-- ---------------------------------------------------------------
-- O cliente listou 11 categorias e vai pedir a 12ª. ENUM exige migração por
-- categoria e não permite desativar, reordenar, colorir nem dar ícone.
CREATE TABLE IF NOT EXISTS public.feed_categories (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  description      TEXT,
  icon             TEXT,
  color            TEXT,
  order_index      INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  requires_sponsor BOOLEAN NOT NULL DEFAULT false,
  default_notify   BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.feed_categories (slug, name, icon, color, order_index, requires_sponsor, default_notify) VALUES
  ('comunicados',           'Comunicados',            'megaphone',    '#C97F00',  1, false, true),
  ('conteudo-tecnico',      'Conteúdo Técnico',       'book-open',    '#2F6B47',  2, false, false),
  ('treinamentos',          'Treinamentos',           'graduation-cap','#2B5F8F', 3, false, true),
  ('eventos',               'Eventos',                'calendar',     '#7A4BA8',  4, false, true),
  ('oportunidades',         'Oportunidades',          'briefcase',    '#0F766E',  5, false, true),
  ('lancamentos',           'Lançamentos',            'sparkles',     '#B45309',  6, false, false),
  ('campanhas-patrocinadas','Campanhas Patrocinadas', 'badge-dollar-sign','#A32218', 7, true, false),
  ('pesquisas',             'Pesquisas',              'clipboard-list','#475569', 8, false, false),
  ('enquetes',              'Enquetes',               'bar-chart-3',  '#64748B',  9, false, false),
  ('promocoes',             'Promoções',              'tag',          '#BE185D', 10, false, false),
  ('novidades-plataforma',  'Novidades da Plataforma','rocket',       '#0369A1', 11, false, true)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------
-- Patrocinadores
-- ---------------------------------------------------------------
-- Criada já na Fase 1 mesmo sem tela: um fabricante patrocina sem ter login,
-- e adicionar isto depois seria ALTER numa tabela com dado de produção e RLS.
CREATE TABLE IF NOT EXISTS public.feed_sponsors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  legal_name    TEXT,
  cnpj          TEXT UNIQUE,
  sponsor_type  TEXT NOT NULL DEFAULT 'fabricante'
                CHECK (sponsor_type IN ('fabricante','loja','distribuidor','parceiro','outro')),
  partner_id    UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  logo_url      TEXT,
  website_url   TEXT,
  primary_color TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fundação do Portal do Patrocinador (Fase 4). Vazia agora; custo zero.
CREATE TABLE IF NOT EXISTS public.feed_sponsor_users (
  sponsor_id UUID NOT NULL REFERENCES public.feed_sponsors(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sponsor_id, user_id)
);

-- ---------------------------------------------------------------
-- Campanhas
-- ---------------------------------------------------------------
-- Guarda-chuva sobre N publicações. Separada do post porque o relatório é
-- pedido POR campanha e POR patrocinador, e uma campanha tem período, verba
-- e meta próprios.
CREATE TABLE IF NOT EXISTS public.feed_campaigns (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sponsor_id    UUID NOT NULL REFERENCES public.feed_sponsors(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  objective     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','scheduled','active','paused','ended','archived')),
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  budget_cents  BIGINT,
  contract_ref  TEXT,
  goal_impressions INT,
  goal_clicks   INT,
  goal_leads    INT,
  frequency_cap INT,
  notes         TEXT,
  created_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feed_campaign_periodo CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_feed_campaigns_sponsor ON public.feed_campaigns(sponsor_id, status);

-- ---------------------------------------------------------------
-- Regras de audiência (motor de segmentação)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_audience_rules (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  description    TEXT,
  definition     JSONB NOT NULL,
  is_reusable    BOOLEAN NOT NULL DEFAULT true,
  is_dynamic     BOOLEAN NOT NULL DEFAULT true,
  estimated_size INT,
  computed_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Materialização. A alternativa — avaliar a regra a cada leitura do feed —
-- transformaria um index scan numa varredura de perfis por publicação.
CREATE TABLE IF NOT EXISTS public.feed_audience_members (
  rule_id     UUID NOT NULL REFERENCES public.feed_audience_rules(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rule_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_audience_user
  ON public.feed_audience_members(user_id, rule_id);

-- As três audiências que existem hoje viram regras, para haver um só
-- mecanismo de visibilidade desde o começo.
INSERT INTO public.feed_audience_rules (id, name, description, definition, is_reusable, is_dynamic)
VALUES
  ('00000000-0000-0000-0000-0000000000a1','Todos','Todos os usuários ativos',
   '{"op":"and","rules":[]}'::jsonb, true, true),
  ('00000000-0000-0000-0000-0000000000a2','Equipe interna','Administradores e técnicos',
   '{"op":"and","rules":[{"field":"role","op":"in","values":["admin","technician"]}]}'::jsonb, true, true),
  ('00000000-0000-0000-0000-0000000000a3','Lojas parceiras','Usuários com papel de loja',
   '{"op":"and","rules":[{"field":"role","op":"in","values":["admin","partner"]}]}'::jsonb, true, true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- O post estendido
-- ---------------------------------------------------------------
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.feed_categories(id),
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.feed_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sponsor_id  UUID REFERENCES public.feed_sponsors(id) ON DELETE SET NULL,

  -- Ciclo de vida. `is_published` continua existindo, sincronizada por
  -- gatilho, porque o app publicado nas lojas ainda lê aquela coluna.
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft','scheduled','published','paused','archived')),
  ADD COLUMN IF NOT EXISTS publish_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unpublish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicated_from UUID REFERENCES public.feed_posts(id) ON DELETE SET NULL,

  -- Fixação com prazo. Antes era um booleano sem fim.
  ADD COLUMN IF NOT EXISTS pinned_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_priority SMALLINT NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS audience_rule_id UUID REFERENCES public.feed_audience_rules(id),

  ADD COLUMN IF NOT EXISTS notify_on_publish BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_title TEXT,
  ADD COLUMN IF NOT EXISTS notification_body  TEXT,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,

  ADD COLUMN IF NOT EXISTS comments_enabled  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reactions_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Contadores gravados. Antes o feed carregava todas as linhas de curtida e
  -- comentário da página e contava em JavaScript.
  ADD COLUMN IF NOT EXISTS like_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS save_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS poll_vote_count INT NOT NULL DEFAULT 0,
  -- Estes vêm da agregação de eventos, não de gatilho.
  ADD COLUMN IF NOT EXISTS impression_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_reach     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_view_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_count   INT NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS sort_key   BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_ref JSONB;

-- Selo "Patrocinado" derivado do dado. Digitado, poderia divergir do vínculo.
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN
    GENERATED ALWAYS AS (sponsor_id IS NOT NULL) STORED;

-- Migra o que existe: audiência de enum para regra, publicado para status.
UPDATE public.feed_posts SET audience_rule_id = CASE audience::TEXT
    WHEN 'employees' THEN '00000000-0000-0000-0000-0000000000a2'::uuid
    WHEN 'partners'  THEN '00000000-0000-0000-0000-0000000000a3'::uuid
    ELSE '00000000-0000-0000-0000-0000000000a1'::uuid
  END
 WHERE audience_rule_id IS NULL;

UPDATE public.feed_posts
   SET status = CASE WHEN is_published THEN 'published' ELSE 'draft' END,
       published_at = COALESCE(published_at, CASE WHEN is_published THEN created_at END)
 WHERE status = 'published' AND published_at IS NULL;

-- ---------------------------------------------------------------
-- Ordenação e coerência
-- ---------------------------------------------------------------
-- sort_key = faixa * 10^12 + segundos da publicação.
--   3 = fixado vigente · 2 = patrocinado de campanha · 1 = comum
-- Uma coluna só, indexável, e paginação por cursor estável — a paginação por
-- deslocamento repetia item quando algo era publicado durante a rolagem.
CREATE OR REPLACE FUNCTION public.feed_calcular_sort_key(
  p_pinned_until TIMESTAMPTZ,
  p_sponsor_id UUID,
  p_campaign_id UUID,
  p_published_at TIMESTAMPTZ,
  p_created_at TIMESTAMPTZ
) RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE
    WHEN p_pinned_until IS NOT NULL AND p_pinned_until > NOW() THEN 3
    WHEN p_sponsor_id IS NOT NULL AND p_campaign_id IS NOT NULL THEN 2
    ELSE 1
  END)::BIGINT * 1000000000000
  + EXTRACT(EPOCH FROM COALESCE(p_published_at, p_created_at))::BIGINT;
$$;

CREATE OR REPLACE FUNCTION public.feed_post_before_write() RETURNS TRIGGER AS $$
BEGIN
  -- Post de campanha herda o patrocinador da campanha.
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT sponsor_id INTO NEW.sponsor_id
      FROM public.feed_campaigns WHERE id = NEW.campaign_id;
  END IF;

  -- Compatibilidade com o app já instalado, que lê estas duas colunas.
  NEW.is_published := (NEW.status = 'published');
  IF NEW.pinned_until IS NOT NULL THEN
    NEW.is_pinned := NEW.pinned_until > NOW();
  END IF;

  NEW.sort_key := public.feed_calcular_sort_key(
    NEW.pinned_until, NEW.sponsor_id, NEW.campaign_id, NEW.published_at, NEW.created_at
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feed_post_before_write ON public.feed_posts;
CREATE TRIGGER trg_feed_post_before_write
  BEFORE INSERT OR UPDATE ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.feed_post_before_write();

UPDATE public.feed_posts SET updated_at = updated_at;  -- força o recálculo

CREATE INDEX IF NOT EXISTS idx_feed_posts_feed
  ON public.feed_posts(sort_key DESC, id DESC)
  WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feed_posts_agendados
  ON public.feed_posts(publish_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_feed_posts_campanha
  ON public.feed_posts(campaign_id) WHERE campaign_id IS NOT NULL;

-- ---------------------------------------------------------------
-- Mídia estruturada
-- ---------------------------------------------------------------
-- `media_urls TEXT[]` não carrega ordem confiável, não distingue documento de
-- imagem (sem o que "Baixar Catálogo" não tem alvo), não guarda duração (sem
-- a qual não há quartil de vídeo) e não tem estado — que é justamente o que
-- permite o envio direto ao armazenamento.
CREATE TABLE IF NOT EXISTS public.feed_post_media (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id        UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  position       SMALLINT NOT NULL DEFAULT 0,
  kind           TEXT NOT NULL CHECK (kind IN ('image','video','document')),
  storage_bucket TEXT NOT NULL DEFAULT 'feed',
  storage_path   TEXT NOT NULL,
  public_url     TEXT,
  thumbnail_url  TEXT,
  mime_type      TEXT,
  byte_size      BIGINT,
  width INT, height INT,
  duration_seconds NUMERIC(8,2),
  alt_text       TEXT,
  caption        TEXT,
  file_name      TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','ready','failed')),
  uploaded_by    UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, position)
);
CREATE INDEX IF NOT EXISTS idx_feed_media_post
  ON public.feed_post_media(post_id, position);

-- Mantém `media_urls` preenchida a partir da mídia pronta, para o app antigo
-- continuar exibindo enquanto a atualização não chega a todos os aparelhos.
CREATE OR REPLACE FUNCTION public.feed_sincronizar_media_urls() RETURNS TRIGGER AS $$
DECLARE v_post UUID;
BEGIN
  v_post := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE public.feed_posts p
     SET media_urls = COALESCE((
           SELECT array_agg(m.public_url ORDER BY m.position)
             FROM public.feed_post_media m
            WHERE m.post_id = v_post AND m.status = 'ready' AND m.public_url IS NOT NULL
         ), '{}')
   WHERE p.id = v_post;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feed_media_sync ON public.feed_post_media;
CREATE TRIGGER trg_feed_media_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.feed_post_media
  FOR EACH ROW EXECUTE FUNCTION public.feed_sincronizar_media_urls();

-- ---------------------------------------------------------------
-- Botões de ação
-- ---------------------------------------------------------------
-- Tabela filha porque um lançamento plausivelmente tem "Conhecer Produto" e
-- "Baixar Catálogo" juntos.
CREATE TABLE IF NOT EXISTS public.feed_post_ctas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  position     SMALLINT NOT NULL DEFAULT 0,
  cta_type     TEXT NOT NULL CHECK (cta_type IN (
                 'conhecer_produto','baixar_catalogo','solicitar_amostra',
                 'utilizar_cupom','solicitar_contato','participar_treinamento',
                 'comprar_agora','encontrar_revendedor','saiba_mais',
                 'assistir_video','responder_pesquisa','acessar_curso','link_externo')),
  label        TEXT NOT NULL,
  style        TEXT NOT NULL DEFAULT 'primary',
  target_url   TEXT,
  target_media_id UUID REFERENCES public.feed_post_media(id) ON DELETE SET NULL,
  target_route TEXT,
  coupon_code  TEXT,
  requires_lead_form BOOLEAN NOT NULL DEFAULT false,
  lead_form_schema JSONB,
  click_count  INT NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, position)
);
CREATE INDEX IF NOT EXISTS idx_feed_ctas_post ON public.feed_post_ctas(post_id, position);
