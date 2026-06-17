-- 2026-06-17 — Habilita Supabase Realtime nas tabelas que o app precisa
-- ouvir pra atualizar a UI sem refresh manual.
--
-- Jessica 17/06: o parceiro precisava puxar refresh na aba "Atribuídas"
-- pra ver a OS recém-aceita. Agora o app vai subscribe nessas tabelas
-- e refazer o fetch quando houver mudança que afete o user.

BEGIN;

-- service_orders: atribuições, mudanças de status, etc.
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;

-- service_proposals: para refletir status (pending → accepted/rejected/expired)
-- e novos broadcasts em tempo real.
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_proposals;

COMMIT;
