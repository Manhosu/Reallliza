-- ============================================
-- Migration 051: Calendario inteligente por equipe/especialidade
--                + anexos do orcamento na OS
--                + checklist.technician_id nullable + origin
-- ============================================
-- Jessica 27/07 (pacote pos-20/07):
--   D2: categorias precisam de link pra especialidade (auto-assign na conversao)
--   D3: category-automation precisa rodar sem tecnico designado (assigned)
--   D4: anexos da quote precisam ser copiados pra OS (visiveis pro tecnico)

BEGIN;

-- ============================================
-- 1) Categoria -> Especialidade (D2)
-- ============================================
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS specialty_id UUID
    REFERENCES public.specialties(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.service_categories.specialty_id IS
  'Especialidade tecnica da categoria. Usada pelo auto-assign pra escolher equipe qualificada.';

CREATE INDEX IF NOT EXISTS idx_service_categories_specialty
  ON public.service_categories(specialty_id)
  WHERE specialty_id IS NOT NULL;

-- ============================================
-- 2) Anexos da quote na OS (D4)
-- ============================================
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS material_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS project_files JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.service_orders.material_files IS
  'Array [{url, name, storage_path}] copiado da quote na conversao. Lista de materiais.';
COMMENT ON COLUMN public.service_orders.project_files IS
  'Array [{url, name, storage_path}] copiado da quote. Planta baixa/projeto da obra.';

-- ============================================
-- 3) Checklists: technician_id nullable + origin (D3)
-- ============================================
ALTER TABLE public.checklists
  ALTER COLUMN technician_id DROP NOT NULL;

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS origin TEXT;

COMMENT ON COLUMN public.checklists.technician_id IS
  'Tecnico atribuido. Pode ser NULL quando OS foi auto-assigned pra equipe sem definir tecnico individual.';
COMMENT ON COLUMN public.checklists.origin IS
  'Origem da criacao: auto_from_category | manual | null (legado).';

CREATE INDEX IF NOT EXISTS idx_checklists_origin
  ON public.checklists(origin, service_order_id)
  WHERE origin IS NOT NULL;

-- ============================================
-- 4) Indice pra queries do team-availability (D2)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_service_orders_team_status
  ON public.service_orders(team_id, status)
  WHERE team_id IS NOT NULL;

COMMIT;
