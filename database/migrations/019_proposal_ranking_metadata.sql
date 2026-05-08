-- ============================================
-- Adiciona coluna metadata em service_proposals para guardar o
-- ranking ("Uber model") gerado em broadcasts. Inspeção/auditoria.
-- ============================================

ALTER TABLE public.service_proposals
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN public.service_proposals.metadata IS
  'Snapshot do ranqueamento (top N candidatos com score, distance) para auditoria do modelo Uber.';
