-- ============================================
-- Migration 065: Eventos de consumo e métricas do Feed
-- ============================================
-- Métrica não é retroativa: o que não for coletado agora está perdido. Por
-- isso a coleta entra na Fase 1, mesmo que o painel de análise só chegue na
-- Fase 2.
--
-- SOBRE PARTICIONAMENTO — decisão deliberada de NÃO particionar agora.
-- O desenho previa partição mensal para um volume projetado de ~5 milhões de
-- eventos/mês, que pressupõe milhares de profissionais. A base tem 22 perfis
-- ativos. Nesse volume, uma tabela comum com os índices abaixo aguenta anos,
-- e a manutenção mensal de partições — que o Supabase não automatiza — seria
-- uma tarefa a mais para falhar em silêncio. A migração para tabela
-- particionada é barata justamente enquanto o volume é pequeno; o gatilho
-- para fazê-la é a tabela passar de alguns milhões de linhas.

CREATE TABLE IF NOT EXISTS public.feed_events (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  post_id       UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  -- Anulável: a rotina de anonimização da LGPD zera este campo mantendo o
  -- evento para as contagens agregadas.
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'impression','view','video_start','video_q25','video_q50',
                  'video_q75','video_complete','video_watch','click','download',
                  'poll_vote','expand','carousel_swipe','link_open')),
  media_id      UUID REFERENCES public.feed_post_media(id) ON DELETE SET NULL,
  cta_id        UUID REFERENCES public.feed_post_ctas(id) ON DELETE SET NULL,
  session_id    UUID NOT NULL,
  -- Idempotência: reenvio depois de falha de rede não duplica a contagem.
  client_event_id UUID NOT NULL,
  value_num     NUMERIC,

  -- Retrato do usuário NO MOMENTO do evento. Se o técnico mudar de estado, o
  -- número do mês passado não pode mudar junto.
  dim_uf        CHAR(2),
  dim_city_ibge CHAR(7),
  dim_professional_type TEXT,
  dim_level     TEXT,
  dim_role      TEXT,
  -- Retrato do post, para relatar por campanha sem depender de junção.
  dim_campaign_id UUID,
  dim_sponsor_id  UUID,
  dim_category_id UUID,

  platform      TEXT CHECK (platform IN ('ios','android','web')),
  app_version   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_events_idem
  ON public.feed_events(client_event_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_post
  ON public.feed_events(post_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_events_rollup
  ON public.feed_events(occurred_at, post_id, event_type);

COMMENT ON TABLE public.feed_events IS
  'Append-only, no molde de tool_events. Nenhuma rota atualiza ou apaga —
   correção vira evento novo.';

ALTER TABLE public.feed_events ENABLE ROW LEVEL SECURITY;
-- Sem policy de UPDATE nem DELETE: o histórico é imutável.
DROP POLICY IF EXISTS "Admin le eventos" ON public.feed_events;
CREATE POLICY "Admin le eventos" ON public.feed_events FOR SELECT
  USING (public.get_user_role((SELECT auth.uid())) = 'admin');

-- ---------------------------------------------------------------
-- Alcance único
-- ---------------------------------------------------------------
-- Cardinalidade limitada por publicações × audiência. Serve tanto para o
-- alcance total quanto para deduplicar impressão.
CREATE TABLE IF NOT EXISTS public.feed_post_reach (
  post_id       UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  impressions   INT NOT NULL DEFAULT 1,
  engaged       BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (post_id, user_id)
);

-- Alcance único POR DIA, para "alcance da semana" ser exato em vez de soma.
CREATE TABLE IF NOT EXISTS public.feed_post_daily_reach (
  day     DATE NOT NULL,
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (day, post_id, user_id)
);

-- ---------------------------------------------------------------
-- Progresso de vídeo
-- ---------------------------------------------------------------
-- Máscara de bits por quartil: rever o vídeo não infla a contagem.
CREATE TABLE IF NOT EXISTS public.feed_video_progress (
  post_id        UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  media_id       UUID NOT NULL REFERENCES public.feed_post_media(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quartiles_mask SMALLINT NOT NULL DEFAULT 0,
  max_percent    SMALLINT NOT NULL DEFAULT 0,
  total_watch_ms BIGINT NOT NULL DEFAULT 0,
  sessions       INT NOT NULL DEFAULT 0,
  first_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, media_id, user_id)
);

-- ---------------------------------------------------------------
-- Agregação diária
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_post_daily_metrics (
  day DATE NOT NULL,
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  campaign_id UUID, sponsor_id UUID, category_id UUID,
  impressions BIGINT NOT NULL DEFAULT 0,
  unique_reach INT NOT NULL DEFAULT 0,
  views INT NOT NULL DEFAULT 0,
  reactions INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  shares INT NOT NULL DEFAULT 0,
  saves INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  downloads INT NOT NULL DEFAULT 0,
  poll_votes INT NOT NULL DEFAULT 0,
  video_starts INT NOT NULL DEFAULT 0,
  video_q25 INT NOT NULL DEFAULT 0,
  video_q50 INT NOT NULL DEFAULT 0,
  video_q75 INT NOT NULL DEFAULT 0,
  video_q100 INT NOT NULL DEFAULT 0,
  video_watch_ms BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, post_id)
);

-- Longa-estreita: adiciona dimensão nova sem migração. Limite assumido —
-- não cruza duas dimensões (estado × nível); esse cruzamento sai do evento
-- bruto, sob demanda.
CREATE TABLE IF NOT EXISTS public.feed_post_daily_metrics_dim (
  day DATE NOT NULL,
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  dim_type  TEXT NOT NULL,
  dim_value TEXT NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0,
  unique_reach INT NOT NULL DEFAULT 0,
  views INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  downloads INT NOT NULL DEFAULT 0,
  video_q50 INT NOT NULL DEFAULT 0,
  video_q100 INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, post_id, dim_type, dim_value)
);
CREATE INDEX IF NOT EXISTS idx_feed_dim
  ON public.feed_post_daily_metrics_dim(dim_type, dim_value, day DESC);

CREATE TABLE IF NOT EXISTS public.feed_rollup_state (
  job_name TEXT PRIMARY KEY,
  watermark_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  last_duration_ms INT,
  last_error TEXT
);
INSERT INTO public.feed_rollup_state (job_name, watermark_at)
VALUES ('feed_rollup', NOW() - INTERVAL '1 day')
ON CONFLICT (job_name) DO NOTHING;

-- ---------------------------------------------------------------
-- Ingestão de eventos — o trabalho pesado fica no banco
-- ---------------------------------------------------------------
-- A função serverless só entrega o lote; a agregação roda onde os dados
-- estão. Isso é o que permite sobreviver ao limite de tempo de execução.
CREATE OR REPLACE FUNCTION public.feed_registrar_eventos(p_eventos JSONB)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inseridos INT;
BEGIN
  WITH entrada AS (
    SELECT * FROM jsonb_to_recordset(p_eventos) AS x(
      client_event_id UUID, post_id UUID, user_id UUID, event_type TEXT,
      media_id UUID, cta_id UUID, session_id UUID, value_num NUMERIC,
      occurred_at TIMESTAMPTZ, platform TEXT, app_version TEXT
    )
  ), enriquecido AS (
    SELECT e.*,
           pr.uf AS dim_uf, pr.city_ibge_code AS dim_city_ibge,
           pr.professional_type AS dim_professional_type,
           pr.level AS dim_level, pr.role::TEXT AS dim_role,
           fp.campaign_id AS dim_campaign_id, fp.sponsor_id AS dim_sponsor_id,
           fp.category_id AS dim_category_id
      FROM entrada e
      LEFT JOIN public.profiles pr ON pr.id = e.user_id
      LEFT JOIN public.feed_posts fp ON fp.id = e.post_id
     WHERE fp.id IS NOT NULL
  ), gravado AS (
    INSERT INTO public.feed_events (
      occurred_at, post_id, user_id, event_type, media_id, cta_id,
      session_id, client_event_id, value_num,
      dim_uf, dim_city_ibge, dim_professional_type, dim_level, dim_role,
      dim_campaign_id, dim_sponsor_id, dim_category_id, platform, app_version)
    SELECT COALESCE(occurred_at, NOW()), post_id, user_id, event_type, media_id, cta_id,
           session_id, client_event_id, value_num,
           dim_uf, dim_city_ibge, dim_professional_type, dim_level, dim_role,
           dim_campaign_id, dim_sponsor_id, dim_category_id, platform, app_version
      FROM enriquecido
    ON CONFLICT (client_event_id) DO NOTHING
    RETURNING post_id, user_id, event_type, occurred_at, media_id, value_num
  )
  SELECT count(*) INTO v_inseridos FROM gravado;

  -- Alcance atualizado na mesma transação: o número precisa estar certo sem
  -- esperar a agregação horária.
  INSERT INTO public.feed_post_reach (post_id, user_id, first_seen_at, last_seen_at, impressions)
  SELECT post_id, user_id, MIN(COALESCE(occurred_at, NOW())), MAX(COALESCE(occurred_at, NOW())), count(*)
    FROM jsonb_to_recordset(p_eventos) AS x(post_id UUID, user_id UUID, event_type TEXT, occurred_at TIMESTAMPTZ)
   WHERE event_type = 'impression' AND user_id IS NOT NULL AND post_id IS NOT NULL
   GROUP BY post_id, user_id
  ON CONFLICT (post_id, user_id) DO UPDATE
    SET last_seen_at = GREATEST(feed_post_reach.last_seen_at, EXCLUDED.last_seen_at),
        impressions  = feed_post_reach.impressions + EXCLUDED.impressions;

  INSERT INTO public.feed_post_daily_reach (day, post_id, user_id)
  SELECT DISTINCT COALESCE(occurred_at, NOW())::DATE, post_id, user_id
    FROM jsonb_to_recordset(p_eventos) AS x(post_id UUID, user_id UUID, event_type TEXT, occurred_at TIMESTAMPTZ)
   WHERE event_type = 'impression' AND user_id IS NOT NULL AND post_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  RETURN v_inseridos;
END $$;

-- ---------------------------------------------------------------
-- Agregação incremental
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.feed_agregar(p_ate TIMESTAMPTZ DEFAULT NOW() - INTERVAL '5 minutes')
RETURNS TABLE(linhas_processadas INT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde TIMESTAMPTZ;
  v_linhas INT := 0;
  v_inicio TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT watermark_at INTO v_desde FROM public.feed_rollup_state WHERE job_name = 'feed_rollup';

  -- Recomputa a janela inteira em vez de incrementar: rodar duas vezes não
  -- duplica.
  INSERT INTO public.feed_post_daily_metrics AS m (
    day, post_id, campaign_id, sponsor_id, category_id,
    impressions, views, clicks, downloads, poll_votes,
    video_starts, video_q25, video_q50, video_q75, video_q100, video_watch_ms)
  SELECT e.occurred_at::DATE, e.post_id,
         MAX(e.dim_campaign_id::TEXT)::UUID, MAX(e.dim_sponsor_id::TEXT)::UUID, MAX(e.dim_category_id::TEXT)::UUID,
         count(*) FILTER (WHERE e.event_type='impression'),
         count(*) FILTER (WHERE e.event_type='view'),
         count(*) FILTER (WHERE e.event_type='click'),
         count(*) FILTER (WHERE e.event_type='download'),
         count(*) FILTER (WHERE e.event_type='poll_vote'),
         count(*) FILTER (WHERE e.event_type='video_start'),
         count(*) FILTER (WHERE e.event_type='video_q25'),
         count(*) FILTER (WHERE e.event_type='video_q50'),
         count(*) FILTER (WHERE e.event_type='video_q75'),
         count(*) FILTER (WHERE e.event_type='video_complete'),
         COALESCE(SUM(e.value_num) FILTER (WHERE e.event_type='video_watch'),0)
    FROM public.feed_events e
   WHERE e.occurred_at >= v_desde AND e.occurred_at < p_ate
   GROUP BY e.occurred_at::DATE, e.post_id
  ON CONFLICT (day, post_id) DO UPDATE SET
    impressions=EXCLUDED.impressions, views=EXCLUDED.views, clicks=EXCLUDED.clicks,
    downloads=EXCLUDED.downloads, poll_votes=EXCLUDED.poll_votes,
    video_starts=EXCLUDED.video_starts, video_q25=EXCLUDED.video_q25,
    video_q50=EXCLUDED.video_q50, video_q75=EXCLUDED.video_q75,
    video_q100=EXCLUDED.video_q100, video_watch_ms=EXCLUDED.video_watch_ms;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  -- Alcance único do dia, que não é derivável da contagem de impressões.
  UPDATE public.feed_post_daily_metrics m
     SET unique_reach = r.qtd
    FROM (SELECT day, post_id, count(*) AS qtd
            FROM public.feed_post_daily_reach
           WHERE day >= v_desde::DATE GROUP BY day, post_id) r
   WHERE m.day = r.day AND m.post_id = r.post_id;

  -- Recortes por dimensão.
  INSERT INTO public.feed_post_daily_metrics_dim AS d (
    day, post_id, dim_type, dim_value, impressions, views, clicks, downloads, video_q50, video_q100)
  SELECT x.dia, x.post_id, x.tipo, x.valor,
         count(*) FILTER (WHERE x.event_type='impression'),
         count(*) FILTER (WHERE x.event_type='view'),
         count(*) FILTER (WHERE x.event_type='click'),
         count(*) FILTER (WHERE x.event_type='download'),
         count(*) FILTER (WHERE x.event_type='video_q50'),
         count(*) FILTER (WHERE x.event_type='video_complete')
    FROM (
      SELECT occurred_at::DATE AS dia, post_id, event_type, 'uf' AS tipo, dim_uf AS valor
        FROM public.feed_events WHERE occurred_at >= v_desde AND occurred_at < p_ate AND dim_uf IS NOT NULL
      UNION ALL
      SELECT occurred_at::DATE, post_id, event_type, 'level', dim_level
        FROM public.feed_events WHERE occurred_at >= v_desde AND occurred_at < p_ate AND dim_level IS NOT NULL
      UNION ALL
      SELECT occurred_at::DATE, post_id, event_type, 'role', dim_role
        FROM public.feed_events WHERE occurred_at >= v_desde AND occurred_at < p_ate AND dim_role IS NOT NULL
      UNION ALL
      SELECT occurred_at::DATE, post_id, event_type, 'platform', platform
        FROM public.feed_events WHERE occurred_at >= v_desde AND occurred_at < p_ate AND platform IS NOT NULL
    ) x
   GROUP BY x.dia, x.post_id, x.tipo, x.valor
  ON CONFLICT (day, post_id, dim_type, dim_value) DO UPDATE SET
    impressions=EXCLUDED.impressions, views=EXCLUDED.views, clicks=EXCLUDED.clicks,
    downloads=EXCLUDED.downloads, video_q50=EXCLUDED.video_q50, video_q100=EXCLUDED.video_q100;

  -- Espelha o acumulado na publicação, para o feed não precisar agregar.
  UPDATE public.feed_posts p SET
    impression_count = COALESCE(t.imp,0), video_view_count = COALESCE(t.vs,0),
    click_count = COALESCE(t.cl,0), download_count = COALESCE(t.dl,0),
    unique_reach = COALESCE(u.alcance,0)
   FROM (SELECT post_id, SUM(impressions) imp, SUM(video_starts) vs, SUM(clicks) cl, SUM(downloads) dl
           FROM public.feed_post_daily_metrics GROUP BY post_id) t
   LEFT JOIN (SELECT post_id, count(*) alcance FROM public.feed_post_reach GROUP BY post_id) u
     ON u.post_id = t.post_id
  WHERE p.id = t.post_id;

  UPDATE public.feed_rollup_state
     SET watermark_at = p_ate, last_run_at = NOW(),
         last_duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_inicio)::INT,
         last_error = NULL
   WHERE job_name = 'feed_rollup';

  RETURN QUERY SELECT v_linhas;
END $$;
