-- ============================================================
-- Migration 089: separa o chat da OS em dois canais
--
-- Jessica 31/08: o botao "Conversar" da loja abria o MESMO chat que a
-- Reallliza usa pra falar com o tecnico - sem separacao, a loja veria
-- qualquer coisa que a equipe interna discutisse ali. Ela confirmou: a
-- Reallliza precisa continuar vendo tudo (supervisao), mas a loja so'
-- pode ver a propria conversa com o homologado.
--
-- 'interno'  = Reallliza (staff) <-> tecnico/homologado responsavel
-- 'loja'     = loja (partner_id da OS) <-> tecnico/homologado responsavel
--
-- Default 'interno' preserva as 5 mensagens de teste ja existentes sem
-- precisar de backfill (nenhuma delas era de producao real).
-- ============================================================

ALTER TABLE public.os_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'interno'
  CHECK (channel IN ('interno', 'loja'));

CREATE INDEX IF NOT EXISTS idx_os_messages_channel
  ON public.os_messages(service_order_id, channel);
