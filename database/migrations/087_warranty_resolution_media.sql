-- ============================================================
-- Migration 087: fotos/videos de solução da garantia
--
-- Jose 27/08: o homologado precisa "anexar fotos/comprovantes do serviço
-- executado" ao resolver uma garantia — os campos `photos`/`videos`
-- existentes são da LOJA (evidência do problema, anexada ao abrir). Sem
-- um par próprio pra solução, os dois se misturariam no mesmo array e
-- ninguém saberia mais quem anexou o quê.
-- ============================================================

ALTER TABLE public.warranties
  ADD COLUMN IF NOT EXISTS resolution_photos JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS resolution_videos JSONB DEFAULT '[]';
