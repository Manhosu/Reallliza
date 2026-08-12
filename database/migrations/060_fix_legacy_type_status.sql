-- ============================================
-- Migration 060: limpa o status legado dos tipos por quantidade
-- ============================================
-- Sequela do bug corrigido na 058/059: ao entregar uma unidade, o código
-- antigo marcava o TIPO inteiro como 'in_custody'. Quatro tipos controlados
-- por quantidade ficaram presos nesse estado com o saldo cheio — Lápis com
-- 100 unidades, Trena/Martelo/Régua com 10 cada.
--
-- Enquanto a disponibilidade vinha da coluna `quantity_available`, isso passou
-- despercebido. Com o cálculo novo (Jessica 12/08), o status do tipo entrou na
-- conta e esses quatro apareceram como ZERO disponível — ou seja, o técnico
-- não conseguiria mais pedi-los.
--
-- Custódia de item por quantidade é registrada em tool_custody, nunca no
-- status do tipo. Aqui devolvemos esses registros para 'available'.

BEGIN;

UPDATE public.tool_inventory
SET status = 'available'
WHERE tracking_mode = 'quantity'
  AND status = 'in_custody';

COMMENT ON COLUMN public.tool_inventory.status IS
  'Situacao do TIPO. Para tracking_mode=quantity so faz sentido available / maintenance / retired — custodia e por registro em tool_custody, nao no tipo.';

COMMIT;
