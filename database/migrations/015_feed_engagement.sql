-- ============================================
-- Migration 015: Feed engagement (curtir + comentar)
-- ============================================
-- Adiciona suporte para os técnicos curtirem e comentarem posts do feed.
-- Compartilhar usa Share API nativa do mobile (não persiste no banco).

-- Tabela de likes (1 like por user por post)
CREATE TABLE IF NOT EXISTS public.feed_post_likes (
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_post_likes_post
  ON public.feed_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_post_likes_user
  ON public.feed_post_likes(user_id, created_at DESC);

-- Tabela de comentários
CREATE TABLE IF NOT EXISTS public.feed_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_post_comments_post_created
  ON public.feed_post_comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_post_comments_user
  ON public.feed_post_comments(user_id);

-- Trigger para updated_at em comments
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feed_post_comments_updated ON public.feed_post_comments;
CREATE TRIGGER trg_feed_post_comments_updated
  BEFORE UPDATE ON public.feed_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: qualquer técnico/parceiro autenticado pode ler likes/comments;
-- só pode criar/apagar os próprios.
ALTER TABLE public.feed_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read likes" ON public.feed_post_likes;
CREATE POLICY "Anyone authenticated can read likes"
  ON public.feed_post_likes FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users like for themselves" ON public.feed_post_likes;
CREATE POLICY "Users like for themselves"
  ON public.feed_post_likes FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users unlike their own" ON public.feed_post_likes;
CREATE POLICY "Users unlike their own"
  ON public.feed_post_likes FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone authenticated can read comments" ON public.feed_post_comments;
CREATE POLICY "Anyone authenticated can read comments"
  ON public.feed_post_comments FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users comment as themselves" ON public.feed_post_comments;
CREATE POLICY "Users comment as themselves"
  ON public.feed_post_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users edit own comments" ON public.feed_post_comments;
CREATE POLICY "Users edit own comments"
  ON public.feed_post_comments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own comments or admins delete any" ON public.feed_post_comments;
CREATE POLICY "Users delete own comments or admins delete any"
  ON public.feed_post_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.get_user_role(auth.uid()) = 'admin'
  );
