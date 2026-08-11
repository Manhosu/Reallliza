-- ============================================
-- Migration 055: schedules.source aceita 'quote_paid'
-- ============================================
-- Jessica 10/08: calendario da equipe continuava vazio mesmo depois do fix
-- da 054. Causa restante: scheduleReallizaJobs grava source='quote_paid',
-- valor que o CHECK da 031 nunca aceitou — todo INSERT de schedule vindo da
-- conversao de orcamento pago era rejeitado com 23514 (check violation).
--
-- A 054 corrigiu duas das tres causas (technician_id NOT NULL e o log
-- silencioso); esta fecha a terceira.

BEGIN;

ALTER TABLE public.schedules
  DROP CONSTRAINT IF EXISTS schedules_source_check;

ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_source_check
  CHECK (source IN ('manual','os','os_assignment','proposal_accepted','quote_paid'));

COMMENT ON COLUMN public.schedules.source IS
  'Origem do agendamento. quote_paid = gerado automaticamente na conversao de orcamento pago (modalidade reallliza), um registro por dia util.';

COMMIT;
