-- ============================================
-- Migration 023: Homologação de Profissionais
-- ============================================
-- Marco 6 / Bloco 2 — fila de homologação de profissionais autônomos.
-- O profissional se cadastra publicamente; um admin analisa e aprova
-- ou reprova. Só profissionais homologados recebem OS na distribuição.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_homologated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS homologated_at TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS professional_type TEXT NOT NULL DEFAULT 'internal'
  CHECK (professional_type IN ('internal', 'external'));

CREATE TABLE IF NOT EXISTS public.homologation_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  documents JSONB,
  notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homologation_status
  ON public.homologation_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_homologation_profile
  ON public.homologation_requests(profile_id);

ALTER TABLE public.homologation_requests ENABLE ROW LEVEL SECURITY;

-- A API usa service role; a política é defesa em profundidade para o
-- acesso direto pela Data API. Só admin enxerga/gerencia a fila.
CREATE POLICY "Admins manage homologation_requests"
  ON public.homologation_requests FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
