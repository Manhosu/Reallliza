-- ============================================
-- Migration 043: Prioridade em pedidos de almoxarifado (Jessica 24/06)
-- ============================================
-- Tool requests sao listados FIFO hoje — Jessica pediu que pedidos urgentes
-- pulem pra frente da fila. Reusa o mesmo enum de OS pra consistencia.

BEGIN;

-- Reusa enum os_priority se existir, senao cria novo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_priority') THEN
    CREATE TYPE request_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
END $$;

ALTER TABLE public.tool_requests
  ADD COLUMN IF NOT EXISTS priority request_priority NOT NULL DEFAULT 'medium';

-- Indice composto pra ordenacao por prioridade DESC + data ASC
-- (urgent > high > medium > low; dentro do mesmo nivel, mais antigo primeiro)
CREATE INDEX IF NOT EXISTS idx_tool_requests_priority_status
  ON public.tool_requests (status, priority DESC, created_at ASC);

COMMENT ON COLUMN public.tool_requests.priority IS
  'Prioridade do pedido: urgent (top da fila) > high > medium (default) > low';

COMMIT;
