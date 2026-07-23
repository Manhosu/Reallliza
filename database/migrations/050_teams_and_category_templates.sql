-- ============================================
-- Migration 050: Equipes operacionais + checklist/steps por categoria
-- ============================================
-- Jessica 20/07 (Fases 2-4 pacote):
--   1) Central de Calendario por Equipes (Alfa/Beta/Gama/Delta):
--      cria teams + team_members; adiciona team_id em schedules.
--   2) Checklist por categoria + Automacao Execucao:
--      liga service_categories -> checklist_template + step_template_group
--      pra criar automaticamente no in_progress da OS.
--      COEXISTE com checklist por especialidade (nao substitui).

BEGIN;

-- ============================================
-- 1) Equipes operacionais
-- ============================================
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#EAB308',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.teams IS
  'Equipes operacionais Reallliza (Alfa/Beta/Gama/Delta). Central de Calendario.';

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_leader BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, technician_id)
);

COMMENT ON TABLE public.team_members IS
  'Membros de uma equipe. Especialidades sao herdadas dos membros.';

CREATE INDEX IF NOT EXISTS idx_team_members_tech
  ON public.team_members (technician_id);

-- Seed: 4 equipes fixas
INSERT INTO public.teams (name, color, description) VALUES
  ('Alfa',  '#EAB308', 'Equipe operacional Alfa'),
  ('Beta',  '#3B82F6', 'Equipe operacional Beta'),
  ('Gama',  '#10B981', 'Equipe operacional Gama'),
  ('Delta', '#F97316', 'Equipe operacional Delta')
ON CONFLICT (name) DO NOTHING;

-- Amarra schedule -> equipe (opcional; nullable pra retro-compat)
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_team
  ON public.schedules (team_id, date) WHERE team_id IS NOT NULL;

-- Amarra OS -> equipe designada (opcional; usada pela agenda)
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_team
  ON public.service_orders (team_id) WHERE team_id IS NOT NULL;

-- ============================================
-- 2) Categoria -> checklist_template + step_template_group
--    (COEXISTE com specialty_checklist_items)
-- ============================================
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS checklist_template_id UUID REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS step_template_group_id UUID REFERENCES public.step_template_groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.service_categories.checklist_template_id IS
  'Template de checklist criado automaticamente na OS in_progress. COEXISTE com specialty_checklist_items.';
COMMENT ON COLUMN public.service_categories.step_template_group_id IS
  'Grupo de steps da OS criado automaticamente no in_progress. Usa step_template_items.';

-- ============================================
-- 3) Marca de automacao aplicada (evita re-criar em toggle in_progress)
-- ============================================
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS auto_execution_applied BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_orders.auto_execution_applied IS
  'true quando steps+checklist ja foram criados via automacao categoria. Evita duplicar em transicoes repetidas.';

-- ============================================
-- 4) RLS basico (admin/manager/technician manage; leitura por membros)
-- ============================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_read_authenticated" ON public.teams;
CREATE POLICY "teams_read_authenticated" ON public.teams
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "teams_write_admin" ON public.teams;
CREATE POLICY "teams_write_admin" ON public.teams
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "team_members_read_authenticated" ON public.team_members;
CREATE POLICY "team_members_read_authenticated" ON public.team_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "team_members_write_admin" ON public.team_members;
CREATE POLICY "team_members_write_admin" ON public.team_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

COMMIT;
