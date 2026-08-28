-- ============================================================
-- Migration 088: novo valor de notification_type pra garantia resolvida
--
-- Jose 27/08: a loja precisa ser avisada quando a garantia dela e'
-- resolvida/recusada. `notification_type` e' um ENUM do Postgres (nao um
-- CHECK em texto livre) - inserir com um valor que nao existe no enum
-- falha com "invalid input value for enum" (22P02), e o codigo engolia
-- isso silenciosamente (fire-and-forget com .catch(() => {})). Pego ao
-- testar o fluxo completo em producao: a notificacao nunca chegava.
-- ============================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'warranty_resolved';
