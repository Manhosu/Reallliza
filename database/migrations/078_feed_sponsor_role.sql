-- ============================================
-- Migration 078: papel "sponsor" no enum de roles
-- ============================================
-- Sozinha de propósito: um valor de ENUM recém-adicionado não pode ser
-- consumido na mesma transação que o cria. Qualquer código que grave
-- `role = 'sponsor'` precisa rodar depois desta migration ter comitado.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'sponsor';
