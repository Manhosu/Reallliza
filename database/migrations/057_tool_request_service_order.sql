-- ============================================
-- Migration 057: pedido de ferramenta aponta pra OS
-- ============================================
-- Jessica 22/06 (item 6 do almoxarifado): o historico de cada ferramenta deve
-- registrar "qual OS utilizou aquela ferramenta".
--
-- A coluna tool_custody.service_order_id ja existia, mas o fluxo real
-- (tecnico pede pelo app -> operador entrega) criava a custodia SEM ela:
-- tool_requests nao tinha onde guardar a OS. So' o checkout manual do admin
-- preenchia. Resultado: o historico existia no schema e ficava sempre vazio.

BEGIN;

ALTER TABLE public.tool_requests
  ADD COLUMN IF NOT EXISTS service_order_id UUID
    REFERENCES public.service_orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tool_requests.service_order_id IS
  'OS para a qual a ferramenta foi pedida. Propagada para tool_custody.service_order_id na entrega, alimentando o historico da ferramenta.';

CREATE INDEX IF NOT EXISTS idx_tool_requests_service_order
  ON public.tool_requests(service_order_id)
  WHERE service_order_id IS NOT NULL;

COMMIT;
