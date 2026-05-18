-- ============================================
-- Migration 024: Especialidades + Checklists
-- ============================================
-- Marco 6 / Bloco 3A — catálogo de especialidades técnicas, cada uma
-- com seu próprio checklist de critérios. Base da avaliação de
-- qualidade (fonte QUALIDADE), que pontua cada critério da
-- especialidade executada na OS.

CREATE TABLE IF NOT EXISTS public.specialties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.specialty_checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  specialty_id UUID NOT NULL REFERENCES public.specialties(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  weight INT NOT NULL DEFAULT 1 CHECK (weight >= 1),
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_specialty_checklist_specialty
  ON public.specialty_checklist_items(specialty_id, order_index);

CREATE TRIGGER set_updated_at_specialties
  BEFORE UPDATE ON public.specialties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialty_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read specialties"
  ON public.specialties FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage specialties"
  ON public.specialties FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated read specialty_checklist_items"
  ON public.specialty_checklist_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage specialty_checklist_items"
  ON public.specialty_checklist_items FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
