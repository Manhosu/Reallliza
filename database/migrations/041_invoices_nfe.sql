-- ============================================
-- Migration 041: Emissao automatica de NFe
-- ============================================
-- Spec novosajustes.md (Adicoes ao escopo F4.3):
--  - invoices ganha campos pra rastrear emissao NFe automatica via provedor
--    (Asaas NFe / NFe.io / focoNFe)
--  - chave, numero, serie, XML/PDF URLs, status emissao

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nfe_status') THEN
    CREATE TYPE nfe_status AS ENUM (
      'pending',     -- nao emitida ainda
      'processing',  -- enviada ao provedor, aguardando retorno
      'issued',      -- autorizada pela SEFAZ
      'cancelled',   -- cancelada (janela de 24h)
      'error'        -- falha (ver nfe_error_message)
    );
  END IF;
END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS nfe_status nfe_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS nfe_provider TEXT,
  ADD COLUMN IF NOT EXISTS nfe_external_id TEXT,
  ADD COLUMN IF NOT EXISTS nfe_chave_acesso TEXT,
  ADD COLUMN IF NOT EXISTS nfe_numero TEXT,
  ADD COLUMN IF NOT EXISTS nfe_serie TEXT,
  ADD COLUMN IF NOT EXISTS nfe_xml_url TEXT,
  ADD COLUMN IF NOT EXISTS nfe_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS nfe_emitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nfe_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nfe_error_message TEXT;

COMMENT ON COLUMN public.invoices.nfe_provider IS
  'Provedor que emitiu a NFe: asaas | nfeio | focofne';
COMMENT ON COLUMN public.invoices.nfe_chave_acesso IS
  'Chave de acesso de 44 digitos da SEFAZ. Unica.';

CREATE INDEX IF NOT EXISTS idx_invoices_nfe_status ON public.invoices(nfe_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_nfe_chave ON public.invoices(nfe_chave_acesso)
  WHERE nfe_chave_acesso IS NOT NULL;

COMMIT;
