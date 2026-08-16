-- 070 — A agregação apagava os números do dia a cada execução
--
-- `feed_agregar` lia os eventos da janela `[marca d'água, p_ate)`, contava, e
-- gravava com `ON CONFLICT DO UPDATE SET impressions = EXCLUDED.impressions`
-- e assim por diante. Substituindo, não somando.
--
-- A intenção estava escrita no comentário — "recomputa a janela inteira em vez
-- de incrementar: rodar duas vezes não duplica" — e é correta para uma janela
-- fixa. Só que a janela anda com a marca d'água, e a linha gravada é do DIA.
-- Então cada execução escrevia, no total do dia, apenas os eventos dos últimos
-- cinco minutos. Tudo que veio antes, no mesmo dia, era zerado.
--
-- Flagrado na validação com o aplicativo: os eventos crus tinham 1 início de
-- vídeo, 1 clique e 2 impressões; a linha do dia dizia 0, 0 e 1. O painel
-- mostrava o resultado de uma campanha inteira como se fosse o dos últimos
-- cinco minutos, e o erro cresce com o tráfego — quanto mais o feed for usado,
-- mais eventos cada rodada descarta.
--
-- A correção mantém a ideia certa e conserta o alcance dela: a janela decide
-- QUAIS pares (dia, publicação) precisam ser recalculados; o cálculo em si
-- varre o dia inteiro daqueles pares. Continua idempotente — rodar dez vezes
-- dá o mesmo número — e passa a ser auto-corretivo: qualquer linha estragada
-- se conserta sozinha na próxima passagem que tocar aquele dia.
--
-- Ao final há a reconstrução única do que já estava errado em produção.

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

  -- Alcance único do dia, que não é derivável da contagem de impressões.
  UPDATE public.feed_post_daily_metrics m
     SET unique_reach = r.qtd
    FROM (SELECT day, post_id, count(*) AS qtd
            FROM public.feed_post_daily_reach
           WHERE day >= v_desde::DATE GROUP BY day, post_id) r
   WHERE m.day = r.day AND m.post_id = r.post_id;

  -- Recortes por dimensão, pela mesma regra: janela escolhe, dia inteiro conta.
  WITH tocados AS (
    SELECT DISTINCT e.occurred_at::DATE AS dia, e.post_id
      FROM public.feed_events e
     WHERE e.occurred_at >= v_desde AND e.occurred_at < p_ate
       AND e.post_id IS NOT NULL
  ), desdobrado AS (
    SELECT e.occurred_at::DATE AS dia, e.post_id, e.event_type, d.tipo, d.valor
      FROM public.feed_events e
      JOIN tocados t ON t.dia = e.occurred_at::DATE AND t.post_id = e.post_id
      CROSS JOIN LATERAL (VALUES
        ('uf', e.dim_uf), ('level', e.dim_level),
        ('role', e.dim_role), ('platform', e.platform)
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

-- ---------------------------------------------------------------
-- Reconstrução do que já estava errado
-- ---------------------------------------------------------------
-- Recua a marca d'água para antes do primeiro evento e roda uma vez: com a
-- função corrigida, isso recalcula todos os dias que têm evento. É barato
-- porque `feed_events` é pequena; se um dia deixar de ser, o mesmo efeito se
-- obtém recuando a marca d'água em lotes de alguns dias.
DO $$
DECLARE v_primeiro TIMESTAMPTZ;
BEGIN
  SELECT MIN(occurred_at) INTO v_primeiro FROM public.feed_events;
  IF v_primeiro IS NULL THEN RETURN; END IF;

  UPDATE public.feed_rollup_state
     SET watermark_at = v_primeiro - INTERVAL '1 second'
   WHERE job_name = 'feed_rollup';

  PERFORM public.feed_agregar(NOW());
END $$;
