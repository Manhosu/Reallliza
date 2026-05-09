-- ============================================
-- Migration 015: Proposals — RLS fix para técnicos
-- ============================================
-- A tabela service_proposals já existe. Esta migration
-- adiciona política de UPDATE para técnicos poderem
-- responder (aceitar/rejeitar) propostas via RLS.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'service_proposals'
      AND policyname = 'Technicians can respond to proposals'
  ) THEN
    CREATE POLICY "Technicians can respond to proposals"
      ON public.service_proposals FOR UPDATE
      USING (
        get_user_role(auth.uid()) = 'technician'
        AND status = 'pending'
      );
  END IF;
END $$;
