-- ============================================
-- Migration 015: Propostas de OS para Técnicos
-- ============================================
-- Sistema de propostas: admin cria proposta ligada a uma OS,
-- técnico(s) recebem notificação e podem aceitar/rejeitar.
-- Regra "primeiro aceite leva" — ao aceitar, outras propostas
-- pendentes da mesma OS são automaticamente rejeitadas.

CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  proposed_value NUMERIC(10, 2),
  message TEXT,
  response_message TEXT,
  proposed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_order
  ON public.proposals(service_order_id);

CREATE INDEX IF NOT EXISTS idx_proposals_technician_status
  ON public.proposals(technician_id, status)
  WHERE technician_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_pending
  ON public.proposals(service_order_id, status)
  WHERE status = 'pending';

-- Trigger updated_at
CREATE TRIGGER set_updated_at_proposals
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all proposals"
  ON public.proposals FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Technicians view their own proposals"
  ON public.proposals FOR SELECT
  USING (
    technician_id = auth.uid()
    OR technician_id IS NULL
  );
