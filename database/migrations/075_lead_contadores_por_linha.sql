-- 075 — O gatilho de contadores de lead nunca chegava a contar
--
-- Declarei `FOR EACH STATEMENT` na 071. Nesse modo o Postgres não fornece
-- `NEW` nem `OLD` — a função lia `COALESCE(NEW.post_id, OLD.post_id)`, achava
-- NULL, e o UPDATE não casava com publicação nenhuma. Silenciosamente: nada
-- de erro, só `lead_count` e `conversion_count` parados em zero para sempre.
--
-- Achado testando o ciclo do pedido: o lead entrava, virava convertido,
-- carimbava a data — e a publicação continuava anunciando zero pedidos.
--
-- Por linha é o certo aqui. O volume é baixo (um lead é um ato humano, não
-- uma rajada) e a contagem é recalculada por consulta, então dois leads no
-- mesmo lote não se atropelam.

CREATE OR REPLACE FUNCTION public.feed_lead_contadores()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_post UUID := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  IF v_post IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.feed_posts p SET
    lead_count = (SELECT count(*) FROM public.feed_leads l WHERE l.post_id = v_post),
    conversion_count = (SELECT count(*) FROM public.feed_leads l
                         WHERE l.post_id = v_post AND l.status = 'convertido')
   WHERE p.id = v_post;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_feed_lead_contadores ON public.feed_leads;
CREATE TRIGGER trg_feed_lead_contadores
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.feed_leads
  FOR EACH ROW EXECUTE FUNCTION public.feed_lead_contadores();

-- Acerta o que já entrou enquanto o gatilho não contava.
UPDATE public.feed_posts p SET
  lead_count = (SELECT count(*) FROM public.feed_leads l WHERE l.post_id = p.id),
  conversion_count = (SELECT count(*) FROM public.feed_leads l
                       WHERE l.post_id = p.id AND l.status = 'convertido')
 WHERE EXISTS (SELECT 1 FROM public.feed_leads l WHERE l.post_id = p.id);
