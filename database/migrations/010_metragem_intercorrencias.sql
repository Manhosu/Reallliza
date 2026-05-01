-- ============================================
-- Migration 010: Metragem + Intercorrências
-- ============================================
-- Manual da Jessica seção 7 ("Registros Obrigatórios"):
-- "Durante a execução, o técnico deve registrar... Metragem, Intercorrências"

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS metragem_executada DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS intercorrencias TEXT;
