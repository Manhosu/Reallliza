-- ============================================
-- Migration 025: Avaliação de Qualidade (fonte QUALIDADE)
-- ============================================
-- Marco 6 / Bloco 3B — avaliação técnica de uma OS executada, feita
-- pelo setor de qualidade da Reallliza, pontuando cada critério do
-- checklist da especialidade. É a fonte QUALIDADE do score do
-- profissional.

CREATE TABLE IF NOT EXISTS public.quality_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
  evaluator_id UUID REFERENCES public.profiles(id),
  -- score 0-100: média ponderada dos critérios (1-5) normalizada.
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  needs_rework BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_eval_technician
  ON public.quality_evaluations(technician_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_eval_os
  ON public.quality_evaluations(service_order_id);

CREATE TABLE IF NOT EXISTS public.quality_evaluation_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evaluation_id UUID NOT NULL REFERENCES public.quality_evaluations(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES public.specialty_checklist_items(id) ON DELETE SET NULL,
  -- snapshot do critério no momento da avaliação (sobrevive a edições do checklist).
  item_label TEXT NOT NULL,
  weight INT NOT NULL DEFAULT 1,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_quality_eval_scores_eval
  ON public.quality_evaluation_scores(evaluation_id);

ALTER TABLE public.quality_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_evaluation_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage quality_evaluations"
  ON public.quality_evaluations FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Technicians read own quality_evaluations"
  ON public.quality_evaluations FOR SELECT
  USING (technician_id = auth.uid());

CREATE POLICY "Admins manage quality_evaluation_scores"
  ON public.quality_evaluation_scores FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated read quality_evaluation_scores"
  ON public.quality_evaluation_scores FOR SELECT
  USING (auth.uid() IS NOT NULL);
