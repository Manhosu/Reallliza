-- Migration 017: Adiciona quantidade disponivel para o catalogo de ferramentas.
-- Permite que o admin cadastre quantas unidades existem de cada ferramenta.
-- Tecnico/parceiro consome esse campo para montar o "carrinho" de solicitacao.

ALTER TABLE tool_inventory
  ADD COLUMN IF NOT EXISTS quantity_available INT NOT NULL DEFAULT 1
  CHECK (quantity_available >= 0);
