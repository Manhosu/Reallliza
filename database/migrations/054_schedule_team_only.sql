-- ============================================
-- Migration 054: schedules.technician_id nullable + weekend opt-in
-- ============================================
-- Jessica 03/08:
--   1) Bug: schedules gerados na conversao falhavam silenciosamente porque
--      technician_id era NOT NULL. Agora equipe distribui internamente,
--      technician_id pode ser NULL na criacao inicial.
--   2) Cliente pode autorizar execucao em fim de semana no orcamento
--      (com taxa especial +25%). Nova coluna quotes.allow_weekend.

BEGIN;

ALTER TABLE public.schedules
  ALTER COLUMN technician_id DROP NOT NULL;

COMMENT ON COLUMN public.schedules.technician_id IS
  'Tecnico atribuido. NULL quando OS foi auto-assigned pra equipe sem distribuir individualmente. Team_id preenchido nesse caso.';

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS allow_weekend BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.allow_weekend IS
  'Cliente autorizou execucao em sabado/domingo (taxa +25% ja aplicada em special_hour_extra quando true).';

COMMIT;
