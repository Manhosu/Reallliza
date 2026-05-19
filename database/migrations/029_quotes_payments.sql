-- ============================================
-- Migration 029: Orçamentos da Loja Parceira + Pagamentos
-- ============================================
-- Marco 6 / Bloco 4 — a loja parceira monta um orçamento a partir do
-- catálogo de serviços, paga (Asaas) e o pagamento confirmado converte
-- o orçamento numa OS.

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number SERIAL UNIQUE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting_payment', 'paid', 'converted', 'cancelled')),
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  notes TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  service_order_id UUID REFERENCES public.service_orders(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  unit TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.quote_items(quote_id);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  asaas_id TEXT,
  method TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_quote ON public.payments(quote_id);
CREATE INDEX IF NOT EXISTS idx_payments_asaas ON public.payments(asaas_id);

-- Mantém o vínculo do item da OS ao catálogo (repasse e matchmaking).
ALTER TABLE public.service_order_items
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id);

CREATE TRIGGER set_updated_at_quotes
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- A API usa service role; políticas são defesa em profundidade.
CREATE POLICY "Admins manage quotes"
  ON public.quotes FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Partners read own quotes"
  ON public.quotes FOR SELECT
  USING (partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins manage quote_items"
  ON public.quote_items FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Partners read own quote_items"
  ON public.quote_items FOR SELECT
  USING (quote_id IN (
    SELECT q.id FROM public.quotes q
    JOIN public.partners p ON p.id = q.partner_id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY "Admins manage payments"
  ON public.payments FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Partners read own payments"
  ON public.payments FOR SELECT
  USING (partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
  ));
