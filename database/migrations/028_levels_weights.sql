-- ============================================
-- Migration 028: Níveis Bronze/Prata/Ouro + pesos da avaliação
-- ============================================
-- Marco 6 / Bloco 3E — consolida as 3 fontes (Sistema, Cliente,
-- Qualidade) num score do profissional e num nível. Pesos e critérios
-- são configuráveis pelo painel admin.

-- Pesos das 3 fontes (linha única de configuração).
CREATE TABLE IF NOT EXISTS public.evaluation_weights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  weight_system INT NOT NULL DEFAULT 34 CHECK (weight_system >= 0),
  weight_client INT NOT NULL DEFAULT 33 CHECK (weight_client >= 0),
  weight_quality INT NOT NULL DEFAULT 33 CHECK (weight_quality >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.evaluation_weights (weight_system, weight_client, weight_quality)
SELECT 34, 33, 33
WHERE NOT EXISTS (SELECT 1 FROM public.evaluation_weights);

-- Critérios de cada nível.
CREATE TABLE IF NOT EXISTS public.level_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level TEXT NOT NULL UNIQUE CHECK (level IN ('bronze', 'prata', 'ouro')),
  label TEXT NOT NULL,
  order_index INT NOT NULL,
  min_overall_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_specialties INT NOT NULL DEFAULT 0,
  min_certifications INT NOT NULL DEFAULT 0,
  min_days_active INT NOT NULL DEFAULT 0,
  requires_certification BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.level_config
  (level, label, order_index, min_overall_score, min_specialties,
   min_certifications, min_days_active, requires_certification)
SELECT * FROM (VALUES
  ('bronze', 'Bronze', 1, 0,  0, 0, 0,  false),
  ('prata',  'Prata',  2, 60, 2, 0, 30, false),
  ('ouro',   'Ouro',   3, 80, 4, 1, 90, true)
) AS seed(level, label, order_index, min_overall_score, min_specialties,
          min_certifications, min_days_active, requires_certification)
WHERE NOT EXISTS (SELECT 1 FROM public.level_config);

-- Scores e nível consolidados no profile do profissional.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS system_score NUMERIC(5,2);
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_score NUMERIC(5,2);
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5,2);
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS overall_score NUMERIC(5,2);
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'bronze'
  CHECK (level IN ('bronze', 'prata', 'ouro'));
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS score_calculated_at TIMESTAMPTZ;

CREATE TRIGGER set_updated_at_evaluation_weights
  BEFORE UPDATE ON public.evaluation_weights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_level_config
  BEFORE UPDATE ON public.level_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.evaluation_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read evaluation_weights"
  ON public.evaluation_weights FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage evaluation_weights"
  ON public.evaluation_weights FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated read level_config"
  ON public.level_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage level_config"
  ON public.level_config FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
