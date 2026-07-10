-- ============================================
-- Migration 046: Novos campos no orcamento pro layout PDF Jessica 10/07
-- ============================================
-- Modelo enviado pela Jessica tem 11 campos que o quote nao coleta hoje.
-- Loja preenche todos no form de novo orcamento (confirmado).
--
-- Company_settings tambem ganha campos pra alimentar o bloco "DADOS DA
-- CONTRATADA" do PDF (CNPJ, telefone, email, razao social).

BEGIN;

-- ============================================
-- quotes: 11 novos campos
-- ============================================
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS total_area_m2 NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS rooms TEXT,
  ADD COLUMN IF NOT EXISTS technical_responsible TEXT DEFAULT 'Equipe Reallliza',
  ADD COLUMN IF NOT EXISTS technicians_count INT,
  ADD COLUMN IF NOT EXISTS material_description TEXT,
  ADD COLUMN IF NOT EXISTS warranty_months INT DEFAULT 12,
  ADD COLUMN IF NOT EXISTS execution_start_date DATE,
  ADD COLUMN IF NOT EXISTS scope_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS important_notes TEXT,
  ADD COLUMN IF NOT EXISTS general_notes TEXT;

COMMENT ON COLUMN public.quotes.service_type IS 'Tipo de servico (ex.: Instalacao de piso vinilico clicado SPC)';
COMMENT ON COLUMN public.quotes.total_area_m2 IS 'Area total em m2';
COMMENT ON COLUMN public.quotes.rooms IS 'Ambientes (ex.: Sala grande, copa e banheiro)';
COMMENT ON COLUMN public.quotes.scope_items IS 'Array de strings com itens do escopo (checklist do PDF)';

-- ============================================
-- company_settings: dados institucionais
-- ============================================
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS legal_name TEXT DEFAULT 'Reallliza Revestimento Vinílico',
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT 'comercial@reallliza.com.br';

COMMENT ON COLUMN public.company_settings.legal_name IS 'Razao social pro PDF de orcamento (bloco DADOS DA CONTRATADA)';
COMMENT ON COLUMN public.company_settings.cnpj IS 'CNPJ da Reallliza pro PDF';

COMMIT;
