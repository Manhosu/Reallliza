-- 072 — Os recortes que já eram coletados e nunca eram somados
--
-- Cada evento do feed já carrega cidade, tipo profissional, campanha,
-- patrocinador e categoria desde o primeiro dia. A agregação só somava por
-- UF, nível, papel e plataforma — então o painel oferecia quatro recortes e
-- o banco tinha oito. O dado estava lá, ninguém contava.
--
-- Entram junto:
--
-- REGIÃO, derivada da UF do próprio evento. Não vira coluna nova em
-- `feed_events`: seria dado repetido que pode divergir da UF. Sai da junção
-- com `br_ufs` na hora de somar.
--
-- TIPO DE SERVIÇO, que é o único recorte pedido sem resposta óbvia — um
-- profissional tem várias especialidades, e explodir o evento por todas
-- contaria a mesma impressão N vezes. Gravamos a especialidade DOMINANTE
-- (a de maior nota) no instante do evento. Um valor por evento, sem
-- duplicação, e responde a pergunta que interessa: que tipo de profissional
-- engajou.
--
-- LEAD e CONVERSÃO na série diária, que não saem de `feed_events` — saem da
-- própria tabela de leads, pela data do pedido e pela data da conversão.

ALTER TABLE public.feed_events
  ADD COLUMN IF NOT EXISTS dim_specialty_id UUID;

ALTER TABLE public.feed_post_daily_metrics
  ADD COLUMN IF NOT EXISTS leads       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions INT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------
-- Ingestão: grava a especialidade dominante junto do evento
-- ---------------------------------------------------------------
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
           fp.category_id AS dim_category_id,
           esp.specialty_id AS dim_specialty_id
      FROM entrada e
      LEFT JOIN public.profiles pr ON pr.id = e.user_id
      LEFT JOIN public.feed_posts fp ON fp.id = e.post_id
      -- Especialidade dominante: a de maior nota. Resolvida uma vez, na
      -- entrada, e não a cada leitura do painel.
      LEFT JOIN LATERAL (
        SELECT ts.specialty_id
          FROM public.technician_specialty_scores ts
         WHERE ts.technician_id = e.user_id
         -- Nota média primeiro; empate desempata por volume de OS, senão a
         -- especialidade dominante muda de ordem a cada recálculo.
         ORDER BY ts.score_avg DESC NULLS LAST, ts.os_count DESC NULLS LAST
         LIMIT 1
      ) esp ON true
     WHERE fp.id IS NOT NULL
  ), gravado AS (
    INSERT INTO public.feed_events (
      occurred_at, post_id, user_id, event_type, media_id, cta_id,
      session_id, client_event_id, value_num,
      dim_uf, dim_city_ibge, dim_professional_type, dim_level, dim_role,
      dim_campaign_id, dim_sponsor_id, dim_category_id, dim_specialty_id,
      platform, app_version)
    SELECT COALESCE(occurred_at, NOW()), post_id, user_id, event_type, media_id, cta_id,
           session_id, client_event_id, value_num,
           dim_uf, dim_city_ibge, dim_professional_type, dim_level, dim_role,
           dim_campaign_id, dim_sponsor_id, dim_category_id, dim_specialty_id,
           platform, app_version
      FROM enriquecido
    ON CONFLICT (client_event_id) DO NOTHING
    RETURNING post_id, user_id, event_type, occurred_at, media_id, value_num

  ), alcance AS (
    INSERT INTO public.feed_post_reach (post_id, user_id, first_seen_at, last_seen_at, impressions)
    SELECT post_id, user_id, MIN(occurred_at), MAX(occurred_at), count(*)
      FROM gravado
     WHERE event_type = 'impression' AND user_id IS NOT NULL AND post_id IS NOT NULL
     GROUP BY post_id, user_id
    ON CONFLICT (post_id, user_id) DO UPDATE
      SET last_seen_at = GREATEST(feed_post_reach.last_seen_at, EXCLUDED.last_seen_at),
          impressions  = feed_post_reach.impressions + EXCLUDED.impressions
    RETURNING 1

  ), alcance_dia AS (
    INSERT INTO public.feed_post_daily_reach (day, post_id, user_id)
    SELECT DISTINCT occurred_at::DATE, post_id, user_id
      FROM gravado
     WHERE event_type = 'impression' AND user_id IS NOT NULL AND post_id IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING 1

  ), retencao AS (
    INSERT INTO public.feed_video_progress (
      post_id, media_id, user_id, quartiles_mask, max_percent,
      total_watch_ms, sessions, first_at, last_at)
    SELECT v.post_id, v.media_id, v.user_id,
           COALESCE(bit_or(v.bits), 0)::SMALLINT,
           COALESCE(MAX(v.pct), 0)::SMALLINT,
           COALESCE(SUM(v.ms), 0)::BIGINT,
           COALESCE(SUM(v.inicio), 0)::INT,
           MIN(v.quando), MAX(v.quando)
      FROM (
        SELECT g.post_id, g.media_id, g.user_id, g.occurred_at AS quando,
               CASE g.event_type
                 WHEN 'video_q25' THEN 1 WHEN 'video_q50' THEN 2
                 WHEN 'video_q75' THEN 4 WHEN 'video_complete' THEN 8
                 ELSE 0 END AS bits,
               CASE g.event_type
                 WHEN 'video_q25' THEN 25 WHEN 'video_q50' THEN 50
                 WHEN 'video_q75' THEN 75 WHEN 'video_complete' THEN 100
                 ELSE 0 END AS pct,
               CASE WHEN g.event_type = 'video_watch'
                    THEN COALESCE(g.value_num, 0) ELSE 0 END AS ms,
               CASE WHEN g.event_type = 'video_start' THEN 1 ELSE 0 END AS inicio
          FROM gravado g
          JOIN public.feed_post_media m ON m.id = g.media_id
          JOIN public.profiles pf ON pf.id = g.user_id
         WHERE g.event_type LIKE 'video%'
      ) v
     GROUP BY v.post_id, v.media_id, v.user_id
    ON CONFLICT (post_id, media_id, user_id) DO UPDATE
      SET quartiles_mask = public.feed_video_progress.quartiles_mask | EXCLUDED.quartiles_mask,
          max_percent    = GREATEST(public.feed_video_progress.max_percent, EXCLUDED.max_percent),
          total_watch_ms = public.feed_video_progress.total_watch_ms + EXCLUDED.total_watch_ms,
          sessions       = public.feed_video_progress.sessions + EXCLUDED.sessions,
          last_at        = GREATEST(public.feed_video_progress.last_at, EXCLUDED.last_at)
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridos FROM gravado;

  RETURN v_inseridos;
END $$;

-- ---------------------------------------------------------------
-- Agregação: os oito recortes, mais lead e conversão
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.feed_agregar(p_ate TIMESTAMPTZ DEFAULT NOW() - INTERVAL '5 minutes')
RETURNS TABLE(linhas_processadas INT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde TIMESTAMPTZ;
  v_linhas INT := 0;
  v_inicio TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT watermark_at INTO v_desde FROM public.feed_rollup_state WHERE job_name = 'feed_rollup';

  -- A janela seleciona o que recalcular; o cálculo cobre o dia inteiro.
  WITH tocados AS (
    SELECT DISTINCT e.occurred_at::DATE AS dia, e.post_id
      FROM public.feed_events e
     WHERE e.occurred_at >= v_desde AND e.occurred_at < p_ate
       AND e.post_id IS NOT NULL
  ), completo AS (
    SELECT e.occurred_at::DATE AS dia, e.post_id,
           MAX(e.dim_campaign_id::TEXT)::UUID AS campaign_id,
           MAX(e.dim_sponsor_id::TEXT)::UUID  AS sponsor_id,
           MAX(e.dim_category_id::TEXT)::UUID AS category_id,
           count(*) FILTER (WHERE e.event_type='impression')     AS impressions,
           count(*) FILTER (WHERE e.event_type='view')           AS views,
           count(*) FILTER (WHERE e.event_type='click')          AS clicks,
           count(*) FILTER (WHERE e.event_type='download')       AS downloads,
           count(*) FILTER (WHERE e.event_type='poll_vote')      AS poll_votes,
           count(*) FILTER (WHERE e.event_type='video_start')    AS video_starts,
           count(*) FILTER (WHERE e.event_type='video_q25')      AS video_q25,
           count(*) FILTER (WHERE e.event_type='video_q50')      AS video_q50,
           count(*) FILTER (WHERE e.event_type='video_q75')      AS video_q75,
           count(*) FILTER (WHERE e.event_type='video_complete') AS video_q100,
           COALESCE(SUM(e.value_num) FILTER (WHERE e.event_type='video_watch'),0) AS video_watch_ms
      FROM public.feed_events e
      JOIN tocados t ON t.dia = e.occurred_at::DATE AND t.post_id = e.post_id
     GROUP BY 1, 2
  )
  INSERT INTO public.feed_post_daily_metrics AS m (
    day, post_id, campaign_id, sponsor_id, category_id,
    impressions, views, clicks, downloads, poll_votes,
    video_starts, video_q25, video_q50, video_q75, video_q100, video_watch_ms)
  SELECT dia, post_id, campaign_id, sponsor_id, category_id,
         impressions, views, clicks, downloads, poll_votes,
         video_starts, video_q25, video_q50, video_q75, video_q100, video_watch_ms
    FROM completo
  ON CONFLICT (day, post_id) DO UPDATE SET
    impressions=EXCLUDED.impressions, views=EXCLUDED.views, clicks=EXCLUDED.clicks,
    downloads=EXCLUDED.downloads, poll_votes=EXCLUDED.poll_votes,
    video_starts=EXCLUDED.video_starts, video_q25=EXCLUDED.video_q25,
    video_q50=EXCLUDED.video_q50, video_q75=EXCLUDED.video_q75,
    video_q100=EXCLUDED.video_q100, video_watch_ms=EXCLUDED.video_watch_ms;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  UPDATE public.feed_post_daily_metrics m
     SET unique_reach = r.qtd
    FROM (SELECT day, post_id, count(*) AS qtd
            FROM public.feed_post_daily_reach
           WHERE day >= v_desde::DATE GROUP BY day, post_id) r
   WHERE m.day = r.day AND m.post_id = r.post_id;

  -- Lead e conversão não saem de feed_events: um é a data do pedido, o outro
  -- a data em que virou negócio. Um lead pedido em março e convertido em maio
  -- conta em dois dias diferentes, que é o comportamento certo.
  INSERT INTO public.feed_post_daily_metrics AS m (day, post_id, leads, conversions)
  SELECT dia, post_id, SUM(pedidos)::INT, SUM(convertidos)::INT
    FROM (
      SELECT l.created_at::DATE AS dia, l.post_id, 1 AS pedidos, 0 AS convertidos
        FROM public.feed_leads l
      UNION ALL
      SELECT l.converted_at::DATE, l.post_id, 0, 1
        FROM public.feed_leads l WHERE l.converted_at IS NOT NULL
    ) x
   GROUP BY dia, post_id
  ON CONFLICT (day, post_id) DO UPDATE SET
    leads = EXCLUDED.leads, conversions = EXCLUDED.conversions;

  -- Recortes. Oito dimensões, todas vindas do que já é gravado no evento —
  -- exceto região, que se deduz da UF para não virar dado repetido.
  WITH tocados AS (
    SELECT DISTINCT e.occurred_at::DATE AS dia, e.post_id
      FROM public.feed_events e
     WHERE e.occurred_at >= v_desde AND e.occurred_at < p_ate
       AND e.post_id IS NOT NULL
  ), desdobrado AS (
    SELECT e.occurred_at::DATE AS dia, e.post_id, e.event_type, d.tipo, d.valor
      FROM public.feed_events e
      JOIN tocados t ON t.dia = e.occurred_at::DATE AND t.post_id = e.post_id
      LEFT JOIN public.br_ufs u ON u.uf = e.dim_uf
      CROSS JOIN LATERAL (VALUES
        ('uf',                e.dim_uf),
        ('region',            u.region),
        ('city',              e.dim_city_ibge),
        ('level',             e.dim_level),
        ('role',              e.dim_role),
        ('professional_type', e.dim_professional_type),
        ('specialty',         e.dim_specialty_id::TEXT),
        ('campaign',          e.dim_campaign_id::TEXT),
        ('sponsor',           e.dim_sponsor_id::TEXT),
        ('category',          e.dim_category_id::TEXT),
        ('platform',          e.platform)
      ) AS d(tipo, valor)
     WHERE d.valor IS NOT NULL
  )
  INSERT INTO public.feed_post_daily_metrics_dim AS d (
    day, post_id, dim_type, dim_value, impressions, views, clicks, downloads, video_q50, video_q100)
  SELECT dia, post_id, tipo, valor,
         count(*) FILTER (WHERE event_type='impression'),
         count(*) FILTER (WHERE event_type='view'),
         count(*) FILTER (WHERE event_type='click'),
         count(*) FILTER (WHERE event_type='download'),
         count(*) FILTER (WHERE event_type='video_q50'),
         count(*) FILTER (WHERE event_type='video_complete')
    FROM desdobrado
   GROUP BY dia, post_id, tipo, valor
  ON CONFLICT (day, post_id, dim_type, dim_value) DO UPDATE SET
    impressions=EXCLUDED.impressions, views=EXCLUDED.views, clicks=EXCLUDED.clicks,
    downloads=EXCLUDED.downloads, video_q50=EXCLUDED.video_q50, video_q100=EXCLUDED.video_q100;

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

-- ---------------------------------------------------------------
-- Corte mínimo de agregação — proteção de pessoa, não de dado
-- ---------------------------------------------------------------
-- Com a base do tamanho de hoje, um recorte de "Paraíba + nível ouro" não é
-- um grupo: é uma pessoa, com nome. Entregar esse número a um fabricante é
-- entregar dado pessoal identificável a um terceiro.
--
-- A regra fica no banco, não na tela, porque tela se contorna: qualquer
-- consumidor do recorte — painel, relatório, portal do patrocinador — passa
-- por aqui e recebe a linha suprimida do mesmo jeito.
CREATE OR REPLACE FUNCTION public.feed_recortes_seguros(
  p_post_id UUID,
  p_minimo  INT DEFAULT 5
)
RETURNS TABLE(dim_type TEXT, dim_value TEXT, pessoas INT, impressions BIGINT, clicks BIGINT, suprimido BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pessoas AS (
    SELECT d.tipo, d.valor, count(DISTINCT e.user_id)::INT AS qtd
      FROM public.feed_events e
      LEFT JOIN public.br_ufs u ON u.uf = e.dim_uf
      CROSS JOIN LATERAL (VALUES
        ('uf', e.dim_uf), ('region', u.region), ('city', e.dim_city_ibge),
        ('level', e.dim_level), ('role', e.dim_role),
        ('professional_type', e.dim_professional_type),
        ('specialty', e.dim_specialty_id::TEXT),
        ('campaign', e.dim_campaign_id::TEXT), ('sponsor', e.dim_sponsor_id::TEXT),
        ('category', e.dim_category_id::TEXT), ('platform', e.platform)
      ) AS d(tipo, valor)
     WHERE e.post_id = p_post_id AND d.valor IS NOT NULL AND e.user_id IS NOT NULL
     GROUP BY d.tipo, d.valor
  )
  SELECT m.dim_type, m.dim_value, COALESCE(p.qtd, 0),
         CASE WHEN COALESCE(p.qtd,0) >= p_minimo THEN SUM(m.impressions) ELSE NULL END,
         CASE WHEN COALESCE(p.qtd,0) >= p_minimo THEN SUM(m.clicks)      ELSE NULL END,
         COALESCE(p.qtd,0) < p_minimo
    FROM public.feed_post_daily_metrics_dim m
    LEFT JOIN pessoas p ON p.tipo = m.dim_type AND p.valor = m.dim_value
   WHERE m.post_id = p_post_id
   GROUP BY m.dim_type, m.dim_value, p.qtd
   ORDER BY m.dim_type, 4 DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.feed_recortes_seguros IS
  'Recortes com supressao abaixo de N pessoas distintas. Protege identificacao individual em base pequena.';

NOTIFY pgrst, 'reload schema';
