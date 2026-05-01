-- ============================================
-- Migration 013: Solicitação de Ferramenta
-- ============================================
-- Manual da Jessica seção 12: Técnico solicita ferramenta → admin aprova → libera.
-- Status: PENDING → APPROVED → RELEASED (entrega ao técnico → vira tool_custody)
--                  → REJECTED
--                  → CANCELLED (técnico desiste)

DO $$ BEGIN
  CREATE TYPE public.tool_request_status AS ENUM (
    'pending', 'approved', 'released', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tool_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool_id UUID REFERENCES public.tool_inventory(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL, -- snapshot do nome (caso item seja apagado)
  quantity INT NOT NULL DEFAULT 1,
  justification TEXT,
  status tool_request_status NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  released_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  custody_id UUID REFERENCES public.tool_custody(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_requests_requester
  ON public.tool_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_tool_requests_status
  ON public.tool_requests(status, created_at DESC);

CREATE TRIGGER set_updated_at_tool_requests
  BEFORE UPDATE ON public.tool_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.tool_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all requests"
  ON public.tool_requests FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Technicians view their requests"
  ON public.tool_requests FOR SELECT
  USING (requester_id = auth.uid());

CREATE POLICY "Technicians create requests"
  ON public.tool_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Technicians cancel their pending requests"
  ON public.tool_requests FOR UPDATE
  USING (requester_id = auth.uid() AND status = 'pending')
  WITH CHECK (status IN ('pending', 'cancelled'));
