-- ============================================
-- Migration 022: Regiões de Atuação
-- ============================================
-- Marco 6 / Bloco 1 — cadastro de regiões gerenciável por painel admin.
-- Define as áreas de atuação (nome + UF) usadas na distribuição de OS
-- e no perfil operacional do profissional.

CREATE TABLE IF NOT EXISTS public.regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  uf TEXT NOT NULL CHECK (char_length(uf) = 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_region_name_uf UNIQUE (name, uf)
);

CREATE INDEX IF NOT EXISTS idx_regions_active ON public.regions(is_active);

CREATE TRIGGER set_updated_at_regions
  BEFORE UPDATE ON public.regions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read regions"
  ON public.regions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage regions"
  ON public.regions FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
