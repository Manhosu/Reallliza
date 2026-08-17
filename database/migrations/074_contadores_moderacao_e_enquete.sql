-- 074 — Dois furos nos contadores, achados ao construir moderação e voto
--
-- 1. REMOÇÃO LÓGICA NÃO DECREMENTAVA. O gatilho de contagem dispara em
--    INSERT e DELETE. A moderação esconde ou remove o comentário por
--    atualização — marca `status` e `deleted_at` —, e nenhuma dessas é
--    INSERT nem DELETE. A publicação continuaria anunciando "12 comentários"
--    e listando 11.
--
--    A exclusão feita pelo próprio autor apaga a linha de verdade, então o
--    problema não existia até agora; ele nasceria junto com a moderação.
--
-- 2. `unique_voters` NUNCA FOI PREENCHIDO. Em enquete de múltipla escolha,
--    `total_votes` conta linhas: quem marca três opções conta três. O campo
--    que responde "quantas PESSOAS responderam" existia zerado desde a 064.
--    É a diferença entre "180 votos" e "60 pessoas responderam" — e a
--    segunda é a que vale numa pesquisa.

CREATE OR REPLACE FUNCTION public.feed_contar() RETURNS TRIGGER AS $$
DECLARE
  v_delta INT;
  v_linha RECORD;
  v_sumia BOOLEAN;
  v_some  BOOLEAN;
BEGIN
  -- Atualização só mexe no contador quando o comentário CRUZA a fronteira do
  -- visível. Editar o texto de um comentário visível não é evento de
  -- contagem, e tratar como se fosse zeraria o número aos poucos.
  IF TG_OP = 'UPDATE' THEN
    v_sumia := (OLD.deleted_at IS NOT NULL) OR (OLD.status <> 'visible');
    v_some  := (NEW.deleted_at IS NOT NULL) OR (NEW.status <> 'visible');
    IF v_sumia = v_some THEN
      RETURN NULL;
    END IF;
    v_delta := CASE WHEN v_some THEN -1 ELSE 1 END;
    v_linha := NEW;
  ELSE
    v_delta := CASE TG_OP WHEN 'INSERT' THEN 1 ELSE -1 END;
    v_linha := CASE TG_OP WHEN 'INSERT' THEN NEW ELSE OLD END;
  END IF;

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

    -- Pessoas, não votos. Recontado em vez de somado porque em enquete de
    -- múltipla escolha o delta por linha não diz nada sobre quantidade de
    -- gente: a mesma pessoa gera três linhas.
    UPDATE public.feed_polls
       SET unique_voters = (
             SELECT count(DISTINCT v.user_id)::INT
               FROM public.feed_poll_votes v
              WHERE v.poll_id = v_linha.poll_id)
     WHERE id = v_linha.poll_id;
  END IF;

  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cnt_comments ON public.feed_post_comments;
CREATE TRIGGER trg_cnt_comments
  AFTER INSERT OR DELETE OR UPDATE OF status, deleted_at ON public.feed_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.feed_contar();

-- Conserta o que já estava fora de lugar. Barato: o feed ainda é pequeno, e
-- deixar para depois significa que o primeiro relatório sai errado.
UPDATE public.feed_posts p SET
  comment_count = (SELECT count(*) FROM public.feed_post_comments c
                    WHERE c.post_id = p.id AND c.deleted_at IS NULL AND c.status = 'visible');

UPDATE public.feed_polls pl SET
  unique_voters = (SELECT count(DISTINCT v.user_id)::INT
                     FROM public.feed_poll_votes v WHERE v.poll_id = pl.id),
  total_votes   = (SELECT count(*)::INT
                     FROM public.feed_poll_votes v WHERE v.poll_id = pl.id);

NOTIFY pgrst, 'reload schema';
