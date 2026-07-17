-- ============================================
-- Migration 049: Tipos de pagamento pra suportar "editar proposta"
-- ============================================
-- Jessica 20/07: loja pode editar proposta de homologados quando
-- ninguem aceitou. Se aumentar o valor, paga a diferenca antes da
-- republicacao. Precisamos distinguir esse pagamento adicional do
-- pagamento primario no webhook Asaas pra disparar o refanout.

BEGIN;

DO $$ BEGIN
  CREATE TYPE payment_kind AS ENUM ('primary', 'proposal_topup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS kind payment_kind NOT NULL DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.payments.kind IS
  'primary = pagamento inicial do orcamento; proposal_topup = adicional pra editar proposta (Jessica 20/07)';

COMMIT;
