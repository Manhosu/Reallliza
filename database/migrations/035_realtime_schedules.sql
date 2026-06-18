-- 2026-06-17 — Habilita Supabase Realtime em schedules para que a aba
-- Agenda do app reflita novos agendamentos sem refresh manual.
--
-- Eduardo 17/06: confirmacao end-to-end de que parceiro ve agendamentos
-- gerados quando aceita propostas. Cada createScheduleFromOs gera INSERT
-- aqui — esse hook permite que o mobile re-busque automatico.

BEGIN;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
COMMIT;
