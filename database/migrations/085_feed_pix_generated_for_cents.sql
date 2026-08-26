-- Karol 26/08: PIX copia-e-cola ficava cobrando o valor antigo quando a
-- duração/cobertura da campanha mudava depois do PIX já gerado — o preço
-- recalculava certinho, mas o cache do PIX (pix_asaas_id/pix_copia_cola/...)
-- só era invalidado pelo tempo (~3 dias), nunca por mudança de preço.
--
-- Esta coluna guarda pra qual total_price_cents o PIX cacheado foi gerado,
-- permitindo comparar contra o preço atual da campanha antes de reaproveitar
-- (defesa em profundidade — a rota de PATCH da campanha também zera o cache
-- direto quando o preço muda de verdade).

ALTER TABLE public.feed_campaigns
  ADD COLUMN IF NOT EXISTS pix_generated_for_cents INT;
