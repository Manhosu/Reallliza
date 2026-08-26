-- Código de verificação do Relatório Técnico de Execução e Termo de
-- Garantia (pedido da Jéssica, ago/2026) — gerado na primeira emissão do
-- relatório e reaproveitado depois, pra o QR/link de verificação
-- (/relatorio/[code]) ser estável pro mesmo documento.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS report_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS report_issued_at TIMESTAMPTZ;
