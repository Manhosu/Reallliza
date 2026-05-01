-- ============================================
-- Migration 008: "Cheguei no Local" tracking
-- ============================================
-- Adds dedicated columns to register technician arrival at the work site
-- without changing the os_status enum (keeps existing transitions intact).
--
-- Manual da Jessica seção 5 ("Chegada no local"): registra hora e localização
-- entre "Iniciar Deslocamento" e "Iniciar Execução".

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrival_geo_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS arrival_geo_lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_service_orders_arrived_at
  ON public.service_orders(arrived_at)
  WHERE arrived_at IS NOT NULL;
