-- ============================================
-- Migration 027: Retrabalho / Reincidência
-- ============================================
-- Marco 6 / Bloco 3D — uma OS de retorno técnico pode ser ligada à
-- OS original. A reincidência conta contra o profissional na
-- avaliação e o profissional original tem prioridade no retorno.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS parent_service_order_id UUID
  REFERENCES public.service_orders(id);

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS is_rework BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_service_orders_parent
  ON public.service_orders(parent_service_order_id);
