-- ============================================
-- Migration 066: Visibilidade, bucket e fila de notificação
-- ============================================

-- ---------------------------------------------------------------
-- Uma única definição de "quem pode ver esta publicação"
-- ---------------------------------------------------------------
-- Hoje a regra de visibilidade está escrita duas vezes: no WHERE da rota e na
-- policy. Duas cópias divergem. Esta função é a definição; a policy chama
-- ela, e a rota usa o mesmo predicado com um teste que compara os caminhos.
CREATE OR REPLACE FUNCTION public.feed_pode_ver(p_post UUID, p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feed_posts fp
     WHERE fp.id = p_post
       AND fp.status = 'published'
       AND fp.deleted_at IS NULL
       AND (fp.unpublish_at IS NULL OR fp.unpublish_at > NOW())
       AND (
         fp.audience_rule_id IS NULL
         OR fp.audience_rule_id = '00000000-0000-0000-0000-0000000000a1'::uuid
         OR EXISTS (SELECT 1 FROM public.feed_audience_members m
                     WHERE m.rule_id = fp.audience_rule_id AND m.user_id = p_user)
       )
  );
$$;

-- A policy antiga replicava a lógica do enum de audiência em SQL.
DROP POLICY IF EXISTS "Users can view published feed posts" ON public.feed_posts;
DROP POLICY IF EXISTS "Usuarios veem publicacoes direcionadas" ON public.feed_posts;
-- O subselect em auth.uid() não é firula: sem ele o Postgres reavalia a
-- função por linha e a policy vira o gargalo da tabela.
CREATE POLICY "Usuarios veem publicacoes direcionadas" ON public.feed_posts
  FOR SELECT USING (
    public.feed_pode_ver(id, (SELECT auth.uid()))
    OR public.get_user_role((SELECT auth.uid())) = 'admin'
  );

-- Tabelas filhas herdam a mesma regra — senão o conteúdo de uma publicação
-- segmentada vaza pela mídia ou pelo botão.
ALTER TABLE public.feed_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_post_ctas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_poll_votes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_post_saves   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_post_shares  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_sponsors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_audience_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_audience_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver midia da publicacao" ON public.feed_post_media;
CREATE POLICY "Ver midia da publicacao" ON public.feed_post_media FOR SELECT
  USING (public.feed_pode_ver(post_id, (SELECT auth.uid()))
         OR public.get_user_role((SELECT auth.uid())) = 'admin');

DROP POLICY IF EXISTS "Ver botoes da publicacao" ON public.feed_post_ctas;
CREATE POLICY "Ver botoes da publicacao" ON public.feed_post_ctas FOR SELECT
  USING (public.feed_pode_ver(post_id, (SELECT auth.uid()))
         OR public.get_user_role((SELECT auth.uid())) = 'admin');

DROP POLICY IF EXISTS "Ver enquete" ON public.feed_polls;
CREATE POLICY "Ver enquete" ON public.feed_polls FOR SELECT
  USING (public.feed_pode_ver(post_id, (SELECT auth.uid()))
         OR public.get_user_role((SELECT auth.uid())) = 'admin');

DROP POLICY IF EXISTS "Ver opcoes da enquete" ON public.feed_poll_options;
CREATE POLICY "Ver opcoes da enquete" ON public.feed_poll_options FOR SELECT USING (true);

DROP POLICY IF EXISTS "Votar e ver o proprio voto" ON public.feed_poll_votes;
CREATE POLICY "Votar e ver o proprio voto" ON public.feed_poll_votes FOR ALL
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Gerenciar os proprios salvos" ON public.feed_post_saves;
CREATE POLICY "Gerenciar os proprios salvos" ON public.feed_post_saves FOR ALL
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Registrar compartilhamento" ON public.feed_post_shares;
CREATE POLICY "Registrar compartilhamento" ON public.feed_post_shares FOR ALL
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Curtir comentario" ON public.feed_comment_likes;
CREATE POLICY "Curtir comentario" ON public.feed_comment_likes FOR ALL
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Todos leem categorias" ON public.feed_categories;
CREATE POLICY "Todos leem categorias" ON public.feed_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia patrocinadores" ON public.feed_sponsors;
CREATE POLICY "Admin gerencia patrocinadores" ON public.feed_sponsors FOR ALL
  USING (public.get_user_role((SELECT auth.uid())) = 'admin');

DROP POLICY IF EXISTS "Admin gerencia campanhas" ON public.feed_campaigns;
CREATE POLICY "Admin gerencia campanhas" ON public.feed_campaigns FOR ALL
  USING (public.get_user_role((SELECT auth.uid())) = 'admin');

DROP POLICY IF EXISTS "Admin gerencia audiencias" ON public.feed_audience_rules;
CREATE POLICY "Admin gerencia audiencias" ON public.feed_audience_rules FOR ALL
  USING (public.get_user_role((SELECT auth.uid())) = 'admin');

DROP POLICY IF EXISTS "Ver a propria participacao" ON public.feed_audience_members;
CREATE POLICY "Ver a propria participacao" ON public.feed_audience_members FOR SELECT
  USING (user_id = (SELECT auth.uid())
         OR public.get_user_role((SELECT auth.uid())) = 'admin');

-- ---------------------------------------------------------------
-- Bucket de mídia do Feed
-- ---------------------------------------------------------------
-- Bucket próprio em vez de reaproveitar `photos`: limites, tipos aceitos e
-- ciclo de vida são diferentes dos de foto de OS.
--
-- `.mov` e `.mkv` ficam de fora de propósito: o `.mov` do iPhone costuma ser
-- HEVC, que boa parte dos Android não decodifica. Aceitar e não conseguir
-- tocar é pior que recusar no envio com mensagem clara.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feed','feed', true, 104857600,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif',
        'video/mp4','video/webm','application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Feed: leitura publica" ON storage.objects;
CREATE POLICY "Feed: leitura publica" ON storage.objects FOR SELECT
  USING (bucket_id = 'feed');

DROP POLICY IF EXISTS "Feed: admin envia" ON storage.objects;
CREATE POLICY "Feed: admin envia" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'feed'
              AND public.get_user_role((SELECT auth.uid())) = 'admin');

DROP POLICY IF EXISTS "Feed: admin remove" ON storage.objects;
CREATE POLICY "Feed: admin remove" ON storage.objects FOR DELETE
  USING (bucket_id = 'feed'
         AND public.get_user_role((SELECT auth.uid())) = 'admin');

-- ---------------------------------------------------------------
-- Fila de notificação
-- ---------------------------------------------------------------
-- Publicar apenas enfileira. O envio é retomável por cursor, porque a função
-- serverless tem tempo limitado e o laço um-a-um de hoje perde entregas
-- quando a resposta retorna.
CREATE TABLE IF NOT EXISTS public.feed_notification_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','done','failed','cancelled')),
  total_recipients INT NOT NULL DEFAULT 0,
  notifications_created INT NOT NULL DEFAULT 0,
  push_sent INT NOT NULL DEFAULT 0,
  push_failed INT NOT NULL DEFAULT 0,
  cursor_token TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_notif_pendentes
  ON public.feed_notification_jobs(status, created_at)
  WHERE status IN ('pending','running');

-- Cria as notificações internas numa consulta só, em vez de uma por pessoa.
CREATE OR REPLACE FUNCTION public.feed_criar_notificacoes(
  p_post UUID, p_titulo TEXT, p_corpo TEXT, p_autor UUID
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_regra UUID; v_qtd INT;
BEGIN
  SELECT audience_rule_id INTO v_regra FROM public.feed_posts WHERE id = p_post;

  WITH destinatarios AS (
    SELECT p.id AS user_id
      FROM public.profiles p
     WHERE p.status = 'active'
       AND p.id <> COALESCE(p_autor, '00000000-0000-0000-0000-000000000000'::uuid)
       AND (
         v_regra IS NULL
         OR v_regra = '00000000-0000-0000-0000-0000000000a1'::uuid
         OR EXISTS (SELECT 1 FROM public.feed_audience_members m
                     WHERE m.rule_id = v_regra AND m.user_id = p.id)
       )
  ), gravado AS (
    INSERT INTO public.notifications (user_id, title, message, type, priority, data)
    SELECT d.user_id, p_titulo, p_corpo, 'general', 'normal',
           jsonb_build_object('feed_post_id', p_post)
      FROM destinatarios d
    RETURNING 1
  )
  SELECT count(*) INTO v_qtd FROM gravado;
  RETURN v_qtd;
END $$;
