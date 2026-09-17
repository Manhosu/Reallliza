-- Assinatura do certificado (Jéssica/Eduardo, 17/09): quem assina os
-- certificados de curso pode mudar — não faz sentido fixar isso no código.
-- Fica em company_settings, mesmo singleton usado pra CNPJ/nome legal etc.,
-- editável pela mesma tela de Configurações Globais.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS certificate_signature_url TEXT,
  ADD COLUMN IF NOT EXISTS certificate_signer_name TEXT,
  ADD COLUMN IF NOT EXISTS certificate_signer_title TEXT DEFAULT 'Diretor';
