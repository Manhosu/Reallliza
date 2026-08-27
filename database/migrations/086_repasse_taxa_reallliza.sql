-- José 27/08: a taxa administrativa da Reallliza (platform_fee_amount) hoje
-- só fica implícita no saldo da conta operacional da Asaas — ele quer que
-- ela também seja transferida automaticamente pra uma conta/chave PIX
-- própria da Reallliza no momento do repasse, com o mesmo tratamento que já
-- existe pro prestador (release-payout).

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS payout_pix_key TEXT,
  ADD COLUMN IF NOT EXISTS payout_pix_key_type TEXT
    CHECK (payout_pix_key_type IS NULL OR payout_pix_key_type IN ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS platform_asaas_transfer_id TEXT;
