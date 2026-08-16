-- 068 — Retenção de vídeo por pessoa, e contagem à prova de reenvio
--
-- Dois defeitos na ingestão de eventos, achados quando os quartis de vídeo
-- finalmente passaram a ser emitidos pelo aplicativo:
--
-- 1. `feed_video_progress` foi criada na 065 e nunca recebeu uma linha.
--    Ninguém escrevia nela. É a tabela que responde "quantas pessoas
--    diferentes assistiram até o fim" — a curva de retenção do painel de
--    campanha. Sem ela só existia contagem de eventos, que conta a mesma
--    pessoa revendo o vídeo como se fossem várias.
--
-- 2. O alcance era somado a partir do lote cru (`p_eventos`), não das linhas
--    que de fato entraram. Como o aplicativo reenvia o lote quando a rede
--    falha, e a deduplicação por `client_event_id` só protege
--    `feed_events`, um reenvio inflava `feed_post_reach.impressions`. Agora
--    tudo desce da CTE `gravado`, que já saiu deduplicada.
--
-- A função virou uma única instrução com CTEs que escrevem. O Postgres
-- executa todas até o fim, referenciadas ou não pela consulta principal, e
-- todas enxergam o mesmo instantâneo — que é exatamente o que se quer aqui:
-- o alcance e a retenção nascem do mesmo conjunto de linhas novas.

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

  -- Alcance atualizado na mesma transação: o número precisa estar certo sem
  -- esperar a agregação horária.
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

  -- Retenção por pessoa e por vídeo. A máscara de bits é o que permite rever
  -- o vídeo sem inflar a contagem: OR de bits é idempotente, soma não é.
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
          -- A junção não é enfeite: mídia apagada entre a coleta e o envio
          -- violaria a chave estrangeira e derrubaria o lote inteiro.
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

-- Consulta de retenção do painel: quantas pessoas distintas chegaram a cada
-- quartil. Sai daqui a curva que a Jéssica pediu no formato do Instagram.
CREATE OR REPLACE VIEW public.feed_video_retencao_v AS
SELECT vp.post_id,
       vp.media_id,
       count(*)                                                   AS espectadores,
       count(*) FILTER (WHERE vp.quartiles_mask & 1 = 1)           AS chegaram_25,
       count(*) FILTER (WHERE vp.quartiles_mask & 2 = 2)           AS chegaram_50,
       count(*) FILTER (WHERE vp.quartiles_mask & 4 = 4)           AS chegaram_75,
       count(*) FILTER (WHERE vp.quartiles_mask & 8 = 8)           AS chegaram_100,
       SUM(vp.total_watch_ms)                                      AS tempo_total_ms,
       ROUND(AVG(vp.total_watch_ms))                               AS tempo_medio_ms,
       ROUND(AVG(vp.max_percent), 1)                               AS percentual_medio
  FROM public.feed_video_progress vp
 GROUP BY vp.post_id, vp.media_id;

COMMENT ON VIEW public.feed_video_retencao_v IS
  'Retencao por pessoa: conta espectadores distintos por quartil, nao eventos.';
