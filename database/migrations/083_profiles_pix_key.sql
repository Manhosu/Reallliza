-- Chave PIX do profissional/parceiro homologado, usada pro repasse
-- automático via Asaas Transfer (POST /transfers com pixAddressKey).
-- pix_key_type segue o enum aceito pela Asaas: CPF, CNPJ, EMAIL, PHONE, EVP.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pix_key TEXT,
  ADD COLUMN IF NOT EXISTS pix_key_type TEXT
    CHECK (pix_key_type IS NULL OR pix_key_type IN ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'));
