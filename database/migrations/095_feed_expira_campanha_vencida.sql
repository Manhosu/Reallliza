-- Karol (18/09): campanha paga com prazo vencido continuava no ar
-- indefinidamente -- feed_campaigns.ends_at é calculado certinho na
-- primeira publicação (ver publicarPost em web/src/lib/feed/posts.ts),
-- mas nada nunca comparava "agora" com esse valor depois disso. A única
-- forma de tirar a peça do ar era um admin encerrar a campanha na mão
-- (PATCH /api/feed/campaigns/[id]).
--
-- Reaproveita o cron que já roda a cada 10 minutos (feed_encerrar_vencidos,
-- ver database/migrations/067_feed_audience_engine.sql) em vez de criar um
-- job novo -- mesmo efeito que o encerramento manual já produz: post vira
-- 'paused' (sai do feed, que só mostra status='published'), campanha vira
-- 'ended'. A publicação continua existindo e visível pra loja no próprio
-- perfil (Portal do Patrocinador), só sai do feed geral.
CREATE OR REPLACE FUNCTION public.feed_encerrar_vencidos()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qtd INT;
BEGIN
  UPDATE public.feed_posts
     SET status = 'archived', archived_at = NOW()
   WHERE status = 'published'
     AND unpublish_at IS NOT NULL
     AND unpublish_at <= NOW();
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  UPDATE public.feed_posts
     SET updated_at = NOW()
   WHERE pinned_until IS NOT NULL
     AND pinned_until <= NOW()
     AND is_pinned = true;

  -- Campanha paga vencida: tira a peça do ar (mesmo efeito do encerramento
  -- manual) e marca a campanha como encerrada.
  UPDATE public.feed_posts p
     SET status = 'paused', is_published = false, updated_at = NOW()
    FROM public.feed_campaigns c
   WHERE p.campaign_id = c.id
     AND p.status = 'published'
     AND c.status = 'active'
     AND c.ends_at IS NOT NULL
     AND c.ends_at <= NOW();

  UPDATE public.feed_campaigns
     SET status = 'ended', updated_at = NOW()
   WHERE status = 'active'
     AND ends_at IS NOT NULL
     AND ends_at <= NOW();

  RETURN v_qtd;
END $$;
