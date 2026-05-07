-- ============================================
-- Migration 016: OS items, payments and Cenize fields
-- ============================================
-- Adiciona suporte ao modelo Cenize de OS:
-- - service_order_items: linhas de produtos/servicos
-- - service_order_payments: parcelas de pagamento
-- - Campos extras em service_orders (historico, contato, RG/IE,
--   prev.conclusao, acrescimo, desconto, vale_troca, aprovacao)

-- ============================================
-- 1. Tabela: service_order_items
-- ============================================

CREATE TABLE IF NOT EXISTS public.service_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  kind CHAR(1) NOT NULL CHECK (kind IN ('S','P')),
  identification TEXT,
  description TEXT NOT NULL,
  unit TEXT,
  unit_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  total NUMERIC(14,2) GENERATED ALWAYS AS (unit_value * quantity) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soi_order
  ON public.service_order_items(service_order_id, position);

ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage items" ON public.service_order_items;
CREATE POLICY "Admins manage items"
  ON public.service_order_items FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Tech reads own OS items" ON public.service_order_items;
CREATE POLICY "Tech reads own OS items"
  ON public.service_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id
        AND so.technician_id = auth.uid()
    )
  );

-- ============================================
-- 2. Tabela: service_order_payments (parcelas)
-- ============================================

CREATE TABLE IF NOT EXISTS public.service_order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  payment_type TEXT,
  number_label TEXT,
  doc_number TEXT,
  due_date DATE,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sop_order
  ON public.service_order_payments(service_order_id, position);

ALTER TABLE public.service_order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage payments" ON public.service_order_payments;
CREATE POLICY "Admins manage payments"
  ON public.service_order_payments FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ============================================
-- 3. Campos extras em service_orders
-- ============================================

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS historico TEXT,
  ADD COLUMN IF NOT EXISTS client_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS client_rg_ie TEXT,
  ADD COLUMN IF NOT EXISTS previsao_conclusao DATE,
  ADD COLUMN IF NOT EXISTS acrescimo NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vale_troca NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovado_por TEXT;
