-- ============================================
-- Migration 079: PIX de campanha + correção do cron de agendados
-- ============================================
-- Pode usar 'sponsor' com segurança: a migration 078 já comitou antes desta
-- rodar (arquivo separado).

-- ---------------------------------------------------------------
-- PIX — guardado direto em feed_campaigns, não na tabela `payments`.
-- ---------------------------------------------------------------
-- `payments.quote_id` é FK dura pra `quotes`, e o enum `payment_kind` é
-- fechado — encaixar campanha ali exigiria mexer nos dois. feed_campaigns já
-- tem seu próprio estado de pagamento desde a 077 (payment_status, paid_at
-- etc); os campos de PIX só estendem esse mesmo lugar.
ALTER TABLE public.feed_campaigns
  ADD COLUMN IF NOT EXISTS pix_asaas_id       TEXT,
  ADD COLUMN IF NOT EXISTS pix_checkout_url   TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_code_base64 TEXT,
  ADD COLUMN IF NOT EXISTS pix_copia_cola     TEXT,
  ADD COLUMN IF NOT EXISTS pix_expires_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pix_generated_at   TIMESTAMPTZ;

-- No máximo uma cobrança Asaas viva por campanha.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_campaigns_pix_asaas_id
  ON public.feed_campaigns(pix_asaas_id) WHERE pix_asaas_id IS NOT NULL;

-- ---------------------------------------------------------------
-- Correção: feed_publicar_agendados() nunca promovia a campanha
-- ---------------------------------------------------------------
-- Publicava o post agendado (status -> published) mas deixava
-- feed_campaigns.status parado em 'scheduled' pra sempre — brecha antiga
-- (migration 067), que fica mais provável de aparecer agora que aprovação
-- passa a gerar campanha agendada automaticamente (ver approve/route.ts).
CREATE OR REPLACE FUNCTION public.feed_publicar_agendados()
RETURNS TABLE(post_id UUID, notificar BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  CREATE TEMP TABLE _publicados ON COMMIT DROP AS
  WITH upd AS (
    UPDATE public.feed_posts p
       SET status = 'published', published_at = COALESCE(p.publish_at, NOW())
     WHERE p.status = 'scheduled'
       AND p.publish_at IS NOT NULL
       AND p.publish_at <= NOW()
    RETURNING p.id, p.notify_on_publish, p.campaign_id
  )
  SELECT * FROM upd;

  UPDATE public.feed_campaigns c
     SET status = 'active'
    FROM _publicados pub
   WHERE c.id = pub.campaign_id
     AND c.status = 'scheduled';

  RETURN QUERY SELECT id, notify_on_publish FROM _publicados;
END $$;
