-- ============================================
-- Migration 064: Interações do Feed
-- ============================================
-- Reações com tipo, respostas em comentário, moderação, salvar e
-- compartilhar — com contadores mantidos por gatilho.

-- Reação: coluna nova na tabela existente. A chave primária composta já
-- garante uma reação por pessoa; renomear a tabela para "reactions" seria
-- cosmético e custaria migração de FK.
ALTER TABLE public.feed_post_likes
  ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'like'
    CHECK (reaction IN ('like','love','celebrate','insightful','support'));

-- Comentários: resposta de um nível, moderação e contadores.
ALTER TABLE public.feed_post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID
    REFERENCES public.feed_post_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible','pending','hidden','removed')),
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reply_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pinned   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_feed_comments_thread
  ON public.feed_post_comments(post_id, parent_comment_id, created_at DESC)
  WHERE status = 'visible' AND deleted_at IS NULL;

-- Profundidade máxima 1. Thread infinita exige consulta recursiva com
-- paginação própria, e nenhum feed do mercado usa mais que isso.
CREATE OR REPLACE FUNCTION public.feed_limitar_profundidade() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_comment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.feed_post_comments
     WHERE id = NEW.parent_comment_id AND parent_comment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Resposta a resposta não é permitida';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feed_profundidade ON public.feed_post_comments;
CREATE TRIGGER trg_feed_profundidade
  BEFORE INSERT ON public.feed_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.feed_limitar_profundidade();

CREATE TABLE IF NOT EXISTS public.feed_comment_likes (
  comment_id UUID NOT NULL REFERENCES public.feed_post_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.feed_post_saves (
  post_id    UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_saves_user
  ON public.feed_post_saves(user_id, created_at DESC);

-- Compartilhar não é par único: a mesma pessoa compartilha várias vezes.
CREATE TABLE IF NOT EXISTS public.feed_post_shares (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL DEFAULT 'native'
             CHECK (channel IN ('native','whatsapp','copy_link','email','other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_shares_post ON public.feed_post_shares(post_id);

CREATE TABLE IF NOT EXISTS public.feed_comment_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id  UUID NOT NULL REFERENCES public.feed_post_comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, reporter_id)
);

-- ---------------------------------------------------------------
-- Enquetes
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_polls (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id        UUID NOT NULL UNIQUE REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  question       TEXT NOT NULL,
  allow_multiple BOOLEAN NOT NULL DEFAULT false,
  -- Anônima por padrão: enquete identificada é dado pessoal e precisa de
  -- aviso antes do voto.
  is_anonymous   BOOLEAN NOT NULL DEFAULT true,
  show_results   TEXT NOT NULL DEFAULT 'after_vote'
                 CHECK (show_results IN ('always','after_vote','after_close','never')),
  closes_at      TIMESTAMPTZ,
  total_votes    INT NOT NULL DEFAULT 0,
  unique_voters  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.feed_poll_options (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id    UUID NOT NULL REFERENCES public.feed_polls(id) ON DELETE CASCADE,
  position   SMALLINT NOT NULL,
  label      TEXT NOT NULL,
  image_url  TEXT,
  vote_count INT NOT NULL DEFAULT 0,
  UNIQUE (poll_id, position)
);

CREATE TABLE IF NOT EXISTS public.feed_poll_votes (
  poll_id   UUID NOT NULL REFERENCES public.feed_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.feed_poll_options(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Desnormalizado da enquete só para viabilizar o índice parcial abaixo:
  -- predicado de índice não pode consultar outra tabela.
  is_single_choice BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, option_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_voto_unico
  ON public.feed_poll_votes(poll_id, user_id) WHERE is_single_choice;

-- ---------------------------------------------------------------
-- Contadores por gatilho
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.feed_contar() RETURNS TRIGGER AS $$
DECLARE
  v_delta INT := CASE TG_OP WHEN 'INSERT' THEN 1 ELSE -1 END;
  v_linha RECORD;
BEGIN
  v_linha := CASE TG_OP WHEN 'INSERT' THEN NEW ELSE OLD END;

  IF TG_TABLE_NAME = 'feed_post_likes' THEN
    UPDATE public.feed_posts SET like_count = GREATEST(0, like_count + v_delta)
     WHERE id = v_linha.post_id;

  ELSIF TG_TABLE_NAME = 'feed_post_saves' THEN
    UPDATE public.feed_posts SET save_count = GREATEST(0, save_count + v_delta)
     WHERE id = v_linha.post_id;

  ELSIF TG_TABLE_NAME = 'feed_post_shares' THEN
    UPDATE public.feed_posts SET share_count = GREATEST(0, share_count + v_delta)
     WHERE id = v_linha.post_id;

  ELSIF TG_TABLE_NAME = 'feed_post_comments' THEN
    UPDATE public.feed_posts SET comment_count = GREATEST(0, comment_count + v_delta)
     WHERE id = v_linha.post_id;
    IF v_linha.parent_comment_id IS NOT NULL THEN
      UPDATE public.feed_post_comments
         SET reply_count = GREATEST(0, reply_count + v_delta)
       WHERE id = v_linha.parent_comment_id;
    END IF;

  ELSIF TG_TABLE_NAME = 'feed_comment_likes' THEN
    UPDATE public.feed_post_comments
       SET like_count = GREATEST(0, like_count + v_delta)
     WHERE id = v_linha.comment_id;

  ELSIF TG_TABLE_NAME = 'feed_poll_votes' THEN
    UPDATE public.feed_poll_options
       SET vote_count = GREATEST(0, vote_count + v_delta)
     WHERE id = v_linha.option_id;
    UPDATE public.feed_polls
       SET total_votes = GREATEST(0, total_votes + v_delta)
     WHERE id = v_linha.poll_id;
    UPDATE public.feed_posts p
       SET poll_vote_count = GREATEST(0, p.poll_vote_count + v_delta)
      FROM public.feed_polls pl
     WHERE pl.id = v_linha.poll_id AND p.id = pl.post_id;
  END IF;

  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cnt_likes    ON public.feed_post_likes;
DROP TRIGGER IF EXISTS trg_cnt_saves    ON public.feed_post_saves;
DROP TRIGGER IF EXISTS trg_cnt_shares   ON public.feed_post_shares;
DROP TRIGGER IF EXISTS trg_cnt_comments ON public.feed_post_comments;
DROP TRIGGER IF EXISTS trg_cnt_clikes   ON public.feed_comment_likes;
DROP TRIGGER IF EXISTS trg_cnt_votes    ON public.feed_poll_votes;

CREATE TRIGGER trg_cnt_likes    AFTER INSERT OR DELETE ON public.feed_post_likes    FOR EACH ROW EXECUTE FUNCTION public.feed_contar();
CREATE TRIGGER trg_cnt_saves    AFTER INSERT OR DELETE ON public.feed_post_saves    FOR EACH ROW EXECUTE FUNCTION public.feed_contar();
CREATE TRIGGER trg_cnt_shares   AFTER INSERT OR DELETE ON public.feed_post_shares   FOR EACH ROW EXECUTE FUNCTION public.feed_contar();
CREATE TRIGGER trg_cnt_comments AFTER INSERT OR DELETE ON public.feed_post_comments FOR EACH ROW EXECUTE FUNCTION public.feed_contar();
CREATE TRIGGER trg_cnt_clikes   AFTER INSERT OR DELETE ON public.feed_comment_likes FOR EACH ROW EXECUTE FUNCTION public.feed_contar();
CREATE TRIGGER trg_cnt_votes    AFTER INSERT OR DELETE ON public.feed_poll_votes    FOR EACH ROW EXECUTE FUNCTION public.feed_contar();

-- Contador derivado precisa de rede de segurança. Reconciliação chamada pelo
-- cron diário; barata mesmo com volume, porque agrega só o que foi tocado.
CREATE OR REPLACE FUNCTION public.feed_reconciliar_contadores(p_desde TIMESTAMPTZ DEFAULT NOW() - INTERVAL '48 hours')
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_afetados INT;
BEGIN
  WITH alvo AS (
    SELECT DISTINCT post_id FROM public.feed_post_likes    WHERE created_at >= p_desde
    UNION SELECT DISTINCT post_id FROM public.feed_post_comments WHERE created_at >= p_desde
    UNION SELECT DISTINCT post_id FROM public.feed_post_saves    WHERE created_at >= p_desde
    UNION SELECT DISTINCT post_id FROM public.feed_post_shares   WHERE created_at >= p_desde
  ), recontado AS (
    UPDATE public.feed_posts p SET
      like_count    = (SELECT count(*) FROM public.feed_post_likes    WHERE post_id = p.id),
      comment_count = (SELECT count(*) FROM public.feed_post_comments WHERE post_id = p.id AND deleted_at IS NULL),
      save_count    = (SELECT count(*) FROM public.feed_post_saves    WHERE post_id = p.id),
      share_count   = (SELECT count(*) FROM public.feed_post_shares   WHERE post_id = p.id)
     WHERE p.id IN (SELECT post_id FROM alvo)
    RETURNING 1
  )
  SELECT count(*) INTO v_afetados FROM recontado;
  RETURN v_afetados;
END $$;

-- Alinha os contadores com o que já existe (hoje, zero linhas).
UPDATE public.feed_posts p SET
  like_count    = (SELECT count(*) FROM public.feed_post_likes    WHERE post_id = p.id),
  comment_count = (SELECT count(*) FROM public.feed_post_comments WHERE post_id = p.id);
