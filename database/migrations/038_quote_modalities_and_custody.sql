-- ============================================
-- Migration 038: Quote Modalities + Custodia + Repasse
-- ============================================
-- Spec novosajustes.md (Loja Parceira) — Fase 2:
--   - Modalidade A "Executar com Reallliza" vs B "Publicar para Homologados"
--   - Calculo automatico de deslocamento, estadia, horario especial
--   - Custodia: dinheiro de modalidade B fica retido ate OS concluir
--   - Taxa Reallliza configuravel (company_settings.platform_fee_pct)

BEGIN;

-- ============================================
-- quotes: modalidade + calculo + data execucao
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_modality') THEN
    CREATE TYPE quote_modality AS ENUM ('reallliza', 'homologados');
  END IF;
END $$;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS modality quote_modality,
  -- Endereco/horario do servico (separados do endereco de cobranca/contato)
  ADD COLUMN IF NOT EXISTS service_date DATE,
  ADD COLUMN IF NOT EXISTS service_time TIME,
  -- Calculo automatico (modalidade A: preenchido pelo backend)
  ADD COLUMN IF NOT EXISTS travel_distance_km NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS travel_cost NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stay_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stay_cost NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_special_hour BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS special_hour_extra NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal_services NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_hours NUMERIC(8, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_days INT DEFAULT 0,
  -- Taxa + repasse
  ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(12, 2) DEFAULT 0,
  -- Modalidade B (publicacao pra homologados): regiao alvo
  ADD COLUMN IF NOT EXISTS region_city TEXT,
  ADD COLUMN IF NOT EXISTS region_state CHAR(2),
  -- Status custodia da quote (espelha o resumo do payment)
  ADD COLUMN IF NOT EXISTS custody_held BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.quotes.modality IS
  'reallliza = executado pela equipe Reallliza (preco automatico, sem custodia). homologados = publica pra rede homologados (loja define preco, valor fica em custodia ate OS concluir).';
COMMENT ON COLUMN public.quotes.platform_fee_pct IS
  'Percentual da Reallliza sobre o valor da proposta (modalidade homologados). Snapshot do company_settings.platform_fee_pct no momento da quote.';
COMMENT ON COLUMN public.quotes.payout_amount IS
  'Valor que vai pro homologado apos a Reallliza descontar a taxa (modalidade homologados).';

-- Index pra busca por modalidade + status
CREATE INDEX IF NOT EXISTS idx_quotes_modality ON public.quotes(modality);
CREATE INDEX IF NOT EXISTS idx_quotes_service_date ON public.quotes(service_date)
  WHERE service_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_region ON public.quotes(region_state, region_city)
  WHERE modality = 'homologados';

-- ============================================
-- payments: custody_status + transferencia
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'custody_status') THEN
    CREATE TYPE custody_status AS ENUM ('not_applicable', 'held', 'released', 'refunded');
  END IF;
END $$;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS custody_status custody_status NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS release_reason TEXT,
  -- Asaas transfer (split manual) — pra modalidade homologados
  ADD COLUMN IF NOT EXISTS asaas_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC(12, 2);

COMMENT ON COLUMN public.payments.custody_status IS
  'not_applicable=modalidade Reallliza (direto pra Reallliza), held=pago pela loja, em custodia, released=transferido pro homologado, refunded=devolvido a loja.';

CREATE INDEX IF NOT EXISTS idx_payments_custody ON public.payments(custody_status)
  WHERE custody_status IN ('held', 'released');

-- ============================================
-- proposals: liga proposta ao orcamento da modalidade B
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'proposals'
  ) THEN
    ALTER TABLE public.proposals
      ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_proposals_quote_id ON public.proposals(quote_id)
      WHERE quote_id IS NOT NULL;
  END IF;
END $$;

COMMIT;
