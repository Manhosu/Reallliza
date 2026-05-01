-- ============================================
-- Migration 012: Aprendizado (réplica do Garantias)
-- ============================================
-- Manual da Jessica seção 10. O Garantias é a fonte de verdade.
-- Este Enterprise apenas armazena réplica local para o mobile consumir.

DO $$ BEGIN
  CREATE TYPE public.learning_category AS ENUM ('INSTALACAO', 'PERICIA', 'FERRAMENTAS', 'BOAS_PRATICAS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.learning_content (
  id UUID PRIMARY KEY,                       -- mesmo ID do Garantias para idempotência
  title TEXT NOT NULL,
  description TEXT,
  category learning_category NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_sec INT,
  order_index INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_category_order
  ON public.learning_content(category, order_index)
  WHERE is_published = true;

CREATE TRIGGER set_updated_at_learning
  BEFORE UPDATE ON public.learning_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.learning_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read learning"
  ON public.learning_content FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = true);
