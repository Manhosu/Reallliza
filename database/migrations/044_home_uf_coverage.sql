-- ============================================
-- Migration 044: Cobertura operacional da UF base (Jessica 24/06)
-- ============================================
-- Jessica pediu 2 parametros configuraveis pra politica de atendimento
-- DENTRO da UF base da empresa:
--
--   1. coverage_radius_km       — Raio de cobertura sem deslocamento (km)
--   2. max_service_hours_no_stay — Tempo maximo sem estadia (horas)
--
-- Regra (SOMENTE se UF do atendimento = UF base):
--   - Se distancia <= coverage_radius_km    -> nao cobra deslocamento
--   - Se distancia >  coverage_radius_km    -> cobra deslocamento (R$/km)
--   - Cobra estadia SO SE:
--       distancia > coverage_radius_km  AND  total_hours > max_service_hours_no_stay
--
-- Fora da UF base a logica antiga continua valendo (estadia por diaria
-- em state_stay_rates, deslocamento sempre cobrado).
--
-- Defaults: 100 km / 10 h — mesmos numeros que ela usou no exemplo.
-- Valores 0 ou NULL desativam a regra (mantem comportamento antigo).

BEGIN;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS coverage_radius_km NUMERIC(10, 2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_service_hours_no_stay NUMERIC(6, 2) NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.company_settings.coverage_radius_km IS
  'Raio (km) de cobertura sem cobrar deslocamento. So aplica se UF do atendimento = base_state.';
COMMENT ON COLUMN public.company_settings.max_service_hours_no_stay IS
  'Tempo maximo (horas) de servico sem cobrar estadia. So aplica se UF do atendimento = base_state E distancia > coverage_radius_km.';

COMMIT;
