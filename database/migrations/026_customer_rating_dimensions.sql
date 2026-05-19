-- ============================================
-- Migration 026: Avaliação do Cliente — 5 dimensões
-- ============================================
-- Marco 6 / Bloco 3C — a avaliação do cliente passa às 5 dimensões
-- definidas pelo José: educação, organização, limpeza, atendimento
-- e satisfação geral. As 3 colunas antigas (quality/punctuality/
-- communication) ficam para histórico; o overall_score é recriado
-- como a média de todas as dimensões preenchidas.

ALTER TABLE public.customer_ratings
  ADD COLUMN IF NOT EXISTS educacao SMALLINT CHECK (educacao BETWEEN 1 AND 5);
ALTER TABLE public.customer_ratings
  ADD COLUMN IF NOT EXISTS organizacao SMALLINT CHECK (organizacao BETWEEN 1 AND 5);
ALTER TABLE public.customer_ratings
  ADD COLUMN IF NOT EXISTS limpeza SMALLINT CHECK (limpeza BETWEEN 1 AND 5);
ALTER TABLE public.customer_ratings
  ADD COLUMN IF NOT EXISTS atendimento SMALLINT CHECK (atendimento BETWEEN 1 AND 5);
ALTER TABLE public.customer_ratings
  ADD COLUMN IF NOT EXISTS satisfacao SMALLINT CHECK (satisfacao BETWEEN 1 AND 5);

-- overall_score = média de todas as dimensões não-nulas (antigas + novas).
ALTER TABLE public.customer_ratings DROP COLUMN IF EXISTS overall_score;
ALTER TABLE public.customer_ratings ADD COLUMN overall_score NUMERIC(3,2)
  GENERATED ALWAYS AS (
    (COALESCE(quality,0) + COALESCE(punctuality,0) + COALESCE(communication,0)
     + COALESCE(educacao,0) + COALESCE(organizacao,0) + COALESCE(limpeza,0)
     + COALESCE(atendimento,0) + COALESCE(satisfacao,0))::numeric
    / NULLIF(
        (CASE WHEN quality IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN punctuality IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN communication IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN educacao IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN organizacao IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN limpeza IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN atendimento IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN satisfacao IS NULL THEN 0 ELSE 1 END), 0)
  ) STORED;
