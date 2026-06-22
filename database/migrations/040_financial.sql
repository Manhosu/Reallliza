-- ============================================
-- Migration 040: Financeiro (Marco 4 Parte A)
-- ============================================
-- Spec novosajustes.md: Financeiro completo —
--   - faturas (invoices)
--   - contas a pagar (accounts_payable)
--   - contas a receber (accounts_receivable)
--   - fechamento mensal (monthly_closing)

BEGIN;

-- ============================================
-- invoices: faturas de OS
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('pending', 'paid', 'cancelled', 'overdue');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  numero TEXT,  -- numero interno; preenchido automatico via trigger
  status invoice_status NOT NULL DEFAULT 'pending',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at DATE,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequencia pra numero da fatura: FAT-2026-00001
CREATE SEQUENCE IF NOT EXISTS invoices_numero_seq START 1;

CREATE OR REPLACE FUNCTION assign_invoice_numero()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := 'FAT-' || EXTRACT(YEAR FROM NEW.issued_at)::TEXT ||
                  '-' || LPAD(nextval('invoices_numero_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_invoice_numero ON public.invoices;
CREATE TRIGGER set_invoice_numero
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION assign_invoice_numero();

CREATE TRIGGER set_updated_at_invoices
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_invoices_service_order ON public.invoices(service_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_partner ON public.invoices(partner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issued ON public.invoices(issued_at);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin reads invoices"
  ON public.invoices FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.partners p
      WHERE p.id = invoices.partner_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin writes invoices"
  ON public.invoices FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- accounts_payable + accounts_receivable
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
    CREATE TYPE account_status AS ENUM ('pending', 'paid', 'cancelled', 'overdue');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- 'payout' = repasse pra homologado; 'expense' = despesa operacional;
  -- 'tax' = imposto; 'commission' = comissao
  category TEXT NOT NULL DEFAULT 'expense',
  related_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  related_service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  beneficiary_name TEXT NOT NULL,
  beneficiary_id UUID REFERENCES public.profiles(id),
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status account_status NOT NULL DEFAULT 'pending',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES public.profiles(id),
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_accounts_payable
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_ap_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_ap_due ON public.accounts_payable(due_date);
CREATE INDEX IF NOT EXISTS idx_ap_category ON public.accounts_payable(category);

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads accounts_payable"
  ON public.accounts_payable FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE TABLE IF NOT EXISTS public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL DEFAULT 'quote_payment',
  related_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  related_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  related_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  payer_name TEXT NOT NULL,
  payer_partner_id UUID REFERENCES public.partners(id),
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status account_status NOT NULL DEFAULT 'pending',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_accounts_receivable
  BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_ar_status ON public.accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_ar_due ON public.accounts_receivable(due_date);
CREATE INDEX IF NOT EXISTS idx_ar_category ON public.accounts_receivable(category);

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads accounts_receivable"
  ON public.accounts_receivable FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- monthly_closing: fechamento mensal
-- ============================================
CREATE TABLE IF NOT EXISTS public.monthly_closing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2099),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.profiles(id),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Snapshot de tudo do mes: total_received, total_paid, total_pending,
  -- total_custody, total_released, count_quotes, count_os, count_warranties
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT monthly_closing_year_month_uk UNIQUE (year, month)
);

CREATE TRIGGER set_updated_at_monthly_closing
  BEFORE UPDATE ON public.monthly_closing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.monthly_closing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads monthly_closing"
  ON public.monthly_closing FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

COMMIT;
