-- ============================================
-- Migration 056: RLS enxerga escopo de equipe
-- ============================================
-- Jessica 10/08: OS auto-atribuida na conversao de orcamento fica com
-- team_id preenchido e technician_id NULL (a equipe distribui internamente,
-- ver migration 054). As policies so' olhavam technician_id = auth.uid(),
-- entao o cliente Supabase direto do mobile (realtime) nao enxergava a OS
-- nem os agendamentos da propria equipe.
--
-- As API routes usam service role e ja foram corrigidas no codigo; esta
-- migration fecha o mesmo buraco no acesso direto.

BEGIN;

-- Helper: o usuario e' membro desta equipe?
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.technician_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.is_team_member(UUID) IS
  'True quando auth.uid() e membro da equipe informada. SECURITY DEFINER pra nao depender de RLS em team_members.';

-- ============================================
-- SERVICE ORDERS
-- ============================================
DROP POLICY IF EXISTS "Technicians can view assigned OS" ON public.service_orders;
CREATE POLICY "Technicians can view assigned OS" ON public.service_orders
  FOR SELECT USING (
    technician_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
  );

DROP POLICY IF EXISTS "Technicians can update assigned OS" ON public.service_orders;
CREATE POLICY "Technicians can update assigned OS" ON public.service_orders
  FOR UPDATE USING (
    technician_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
  );

-- ============================================
-- SCHEDULES
-- ============================================
DROP POLICY IF EXISTS "Technicians can view own schedule" ON public.schedules;
CREATE POLICY "Technicians can view own schedule" ON public.schedules
  FOR SELECT USING (
    technician_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
  );

COMMIT;
