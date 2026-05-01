-- ============================================
-- Migration 014: Avaliação do Cliente
-- ============================================
-- Mirror das avaliações que vêm do Garantias (sync via webhook /external/ratings).
-- Diferente de professional_ratings (avaliação interna pelo admin).

CREATE TABLE IF NOT EXISTS public.customer_ratings (
  id UUID PRIMARY KEY,                        -- mesmo ID do Garantias para idempotência
  ticket_id UUID,                             -- ID do ticket no Garantias
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  technician_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quality SMALLINT CHECK (quality BETWEEN 1 AND 5),
  punctuality SMALLINT CHECK (punctuality BETWEEN 1 AND 5),
  communication SMALLINT CHECK (communication BETWEEN 1 AND 5),
  overall_score NUMERIC(3,2) GENERATED ALWAYS AS (
    (COALESCE(quality,0) + COALESCE(punctuality,0) + COALESCE(communication,0))::numeric
    / NULLIF((CASE WHEN quality IS NULL THEN 0 ELSE 1 END +
              CASE WHEN punctuality IS NULL THEN 0 ELSE 1 END +
              CASE WHEN communication IS NULL THEN 0 ELSE 1 END), 0)
  ) STORED,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_ratings_technician_created
  ON public.customer_ratings(technician_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_ratings_os
  ON public.customer_ratings(service_order_id)
  WHERE service_order_id IS NOT NULL;

ALTER TABLE public.customer_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all customer_ratings"
  ON public.customer_ratings FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Technicians view their own ratings"
  ON public.customer_ratings FOR SELECT
  USING (technician_user_id = auth.uid());
