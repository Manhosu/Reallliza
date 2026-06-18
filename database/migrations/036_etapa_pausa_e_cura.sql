-- 2026-06-18 — Etapa: tempo de cura/secagem + pausa por etapa + relatorio.
--
-- Jessica 18/06:
--   1. Templates precisam de "tempo de espera" (cura/secagem) por etapa.
--      Ao concluir a etapa, a proxima so destrava depois desse tempo.
--   2. Tecnico precisa poder pausar e retomar uma etapa em andamento.
--      Cada pausa fica registrada com motivo, e o admin ve relatorio
--      completo do cronograma real da execucao.

BEGIN;

-- Templates: tempo de cura/secagem APOS a etapa concluir.
-- Minutos pra bater com como a Jessica conversa ("30 min", "1 hora").
-- Limite de 24h evita digitacao acidental absurda.
ALTER TABLE public.step_template_items
  ADD COLUMN IF NOT EXISTS wait_time_minutes INT NOT NULL DEFAULT 0;

-- Constraint separada pra rodar idempotente se a coluna ja existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'step_template_items_wait_time_minutes_check'
  ) THEN
    ALTER TABLE public.step_template_items
      ADD CONSTRAINT step_template_items_wait_time_minutes_check
      CHECK (wait_time_minutes >= 0 AND wait_time_minutes <= 1440);
  END IF;
END $$;

-- Execucoes: pausa por etapa + lock por tempo da etapa anterior.
ALTER TABLE public.os_step_executions
  ADD COLUMN IF NOT EXISTS paused_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pause_count         INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pause_seconds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pause_log           JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS unlocked_at         TIMESTAMPTZ;

-- pause_log estrutura: [{ paused_at, resumed_at, duration_seconds, reason? }]
COMMENT ON COLUMN public.os_step_executions.pause_log IS
  'Array JSONB de pausas: [{paused_at, resumed_at, duration_seconds, reason}]. Fonte de verdade para o relatorio.';
COMMENT ON COLUMN public.os_step_executions.unlocked_at IS
  'Timestamp em que a etapa fica disponivel pra iniciar. Setado quando a etapa anterior conclui = completed_at + wait_time_minutes * 60s. Etapa #1 (order_index=0) fica NULL = sempre liberada.';

-- Realtime: o admin pode pausar/retomar via API enquanto o tecnico
-- usa o app — UI precisa atualizar sozinha.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'os_step_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.os_step_executions;
  END IF;
END $$;

COMMIT;
