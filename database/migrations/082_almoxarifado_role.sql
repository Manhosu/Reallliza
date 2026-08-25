-- ============================================
-- Migration 082: papel "almoxarifado" no enum de roles
-- ============================================
-- Pedido da Jéssica (ajustes/ajustes-jessica-agosto-2026.md, seção 5):
-- acesso restrito só às funções de Ferramentas/estoque, sem precisar do
-- papel admin inteiro. Mesmo padrão da migration 078 (papel "sponsor") —
-- sozinha de propósito: um valor de ENUM recém-adicionado não pode ser
-- consumido na mesma transação que o cria.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'almoxarifado';
