-- ============================================
-- Migration 045: Cobertura UF independente + status "Aguardando Designacao"
-- ============================================
-- Jessica 24/06 (2 pedidos amarrados):
--
-- 1) Separar "onde a plataforma opera" de "onde a Reallliza atende
--    diretamente". Hoje so existe company_settings.base_state (1 UF).
--    Isso trava expansao nacional.
--
-- 2) Quando loja paga orcamento modalidade "reallliza", a OS entra sem
--    tecnico nem template de etapas. Precisamos de status intermediario
--    "awaiting_assignment" pra Jessica intervir antes do tecnico ver.

BEGIN;

-- ============================================
-- 1) Cobertura da plataforma (onde lojas/homologados podem existir)
-- ============================================
CREATE TABLE IF NOT EXISTS public.platform_states (
  state CHAR(2) PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

INSERT INTO public.platform_states (state, is_active) VALUES
  ('AC', TRUE), ('AL', TRUE), ('AP', TRUE), ('AM', TRUE),
  ('BA', TRUE), ('CE', TRUE), ('DF', TRUE), ('ES', TRUE),
  ('GO', TRUE), ('MA', TRUE), ('MT', TRUE), ('MS', TRUE),
  ('MG', TRUE), ('PA', TRUE), ('PB', TRUE), ('PR', TRUE),
  ('PE', TRUE), ('PI', TRUE), ('RJ', TRUE), ('RN', TRUE),
  ('RS', TRUE), ('RO', TRUE), ('RR', TRUE), ('SC', TRUE),
  ('SP', TRUE), ('SE', TRUE), ('TO', TRUE)
ON CONFLICT (state) DO NOTHING;

COMMENT ON TABLE public.platform_states IS
  'UFs onde a plataforma esta disponivel — lojas e homologados so podem operar em UFs is_active=true.';

-- ============================================
-- 2) Cobertura Reallliza (onde a Reallliza atende diretamente)
-- ============================================
CREATE TABLE IF NOT EXISTS public.reallliza_service_states (
  state CHAR(2) PRIMARY KEY REFERENCES public.platform_states(state) ON UPDATE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

-- Seed a partir do base_state atual (defensive: se nao existir company_settings,
-- deixa a tabela vazia — admin habilita depois via UI).
DO $$
DECLARE
  v_base CHAR(2);
BEGIN
  SELECT base_state INTO v_base FROM public.company_settings WHERE is_singleton = TRUE LIMIT 1;
  IF v_base IS NOT NULL THEN
    INSERT INTO public.reallliza_service_states (state, is_active)
      VALUES (v_base, TRUE)
      ON CONFLICT (state) DO NOTHING;
  END IF;
END $$;

COMMENT ON TABLE public.reallliza_service_states IS
  'UFs onde a Reallliza executa servicos diretamente (modalidade "reallliza"). Deve ser subconjunto de platform_states.';

-- ============================================
-- 3) RLS
-- ============================================
ALTER TABLE public.platform_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reallliza_service_states ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado
DROP POLICY IF EXISTS "platform_states_read" ON public.platform_states;
CREATE POLICY "platform_states_read" ON public.platform_states
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "reallliza_service_states_read" ON public.reallliza_service_states;
CREATE POLICY "reallliza_service_states_read" ON public.reallliza_service_states
  FOR SELECT TO authenticated USING (TRUE);

-- Escrita: admin (via service role no backend). Sem policy pra role
-- authenticated garante que so service_role escreve.

-- ============================================
-- 4) Novo status "awaiting_assignment" no enum os_status
-- ============================================
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'awaiting_assignment';

COMMIT;
