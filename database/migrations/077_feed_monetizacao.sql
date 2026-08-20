-- ============================================
-- Migration 077: Feed monetizado — Fase 1a
-- ============================================
-- Cobrança e aprovação de campanha, operadas pelo admin. Login de
-- loja/fabricante (Fase 1b) e PIX automático (Fase 2) ficam para depois —
-- aqui só entra o que sustenta o fluxo com confirmação de pagamento manual.
--
-- Decisão: `feed_campaigns` e `feed_posts` continuam tabelas separadas. O
-- relatório agregado por campanha/patrocinador, o cascade que pausa peças ao
-- encerrar campanha e o DELETE que arquiva em vez de apagar (063/tela de
-- campanhas) já resolvem o que fundir jogaria fora, sem ganho nenhum — o
-- "fluxo único" pedido é exigência de UI/API, não de schema.

-- ---------------------------------------------------------------
-- Conta-casa: a própria loja Reallliza publica sem cobrança
-- ---------------------------------------------------------------
-- Flag no formulário de patrocinador que já existe — não um UUID fixo no
-- código, que divergiria entre dev/staging/prod.
ALTER TABLE public.feed_sponsors
  ADD COLUMN IF NOT EXISTS is_house_account BOOLEAN NOT NULL DEFAULT false;

-- No máximo uma conta-casa. Índice sobre uma constante, filtrado pelo
-- predicado: uma segunda linha com is_house_account = true colide na mesma
-- chave.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_sponsors_house_account
  ON public.feed_sponsors ((true)) WHERE is_house_account = true;

-- ---------------------------------------------------------------
-- Preços configuráveis pelo admin
-- ---------------------------------------------------------------
-- Nasce vazia de propósito: se o admin tentar criar campanha paga antes de
-- configurar preço, a API recusa com mensagem clara em vez de deixar passar
-- um valor zerado por acidente.
CREATE TABLE IF NOT EXISTS public.feed_pricing_rules (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope_type           TEXT NOT NULL CHECK (scope_type IN ('nacional','regional')),
  -- NULL = regra genérica daquele scope_type. Só é preenchido quando o admin
  -- quiser um preço específico por UF ou por região — sem migration nova.
  scope_kind           TEXT CHECK (scope_kind IN ('uf','regiao')),
  scope_value          TEXT,
  price_per_day_cents  INT NOT NULL CHECK (price_per_day_cents >= 0),
  min_days             INT NOT NULL DEFAULT 1 CHECK (min_days >= 1),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  updated_by           UUID REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_pricing_rules_escopo
  ON public.feed_pricing_rules (scope_type, COALESCE(scope_kind,''), COALESCE(scope_value,''));

CREATE TRIGGER set_updated_at_feed_pricing_rules
  BEFORE UPDATE ON public.feed_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.feed_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia precos do feed" ON public.feed_pricing_rules;
CREATE POLICY "Admin gerencia precos do feed" ON public.feed_pricing_rules FOR ALL
  USING (public.get_user_role((SELECT auth.uid())) = 'admin');

-- ---------------------------------------------------------------
-- Campanha: cobertura, preço, pagamento e aprovação
-- ---------------------------------------------------------------
ALTER TABLE public.feed_campaigns
  ADD COLUMN IF NOT EXISTS coverage_type    TEXT NOT NULL DEFAULT 'nacional'
    CHECK (coverage_type IN ('nacional','regional')),
  ADD COLUMN IF NOT EXISTS coverage_scope   TEXT CHECK (coverage_scope IN ('uf','regiao')),
  ADD COLUMN IF NOT EXISTS coverage_value   TEXT,

  -- Escolhido na criação, entra no cálculo de preço. `starts_at`/`ends_at`
  -- (já existentes) só são preenchidos quando a campanha é de fato ativada
  -- pelo publish — pedir data de início antes de paga/aprovada não faz
  -- sentido.
  ADD COLUMN IF NOT EXISTS duration_days       INT CHECK (duration_days IS NULL OR duration_days > 0),
  ADD COLUMN IF NOT EXISTS price_per_day_cents INT,
  ADD COLUMN IF NOT EXISTS total_price_cents   INT,
  ADD COLUMN IF NOT EXISTS pricing_rule_id  UUID REFERENCES public.feed_pricing_rules(id) ON DELETE SET NULL,

  ADD COLUMN IF NOT EXISTS payment_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','waived')),
  ADD COLUMN IF NOT EXISTS paid_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_amount_cents    INT,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES public.profiles(id),

  ADD COLUMN IF NOT EXISTS approval_status  TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.feed_campaigns DROP CONSTRAINT IF EXISTS feed_campaign_coverage;
ALTER TABLE public.feed_campaigns
  ADD CONSTRAINT feed_campaign_coverage CHECK (
    (coverage_type = 'nacional' AND coverage_scope IS NULL AND coverage_value IS NULL)
    OR (coverage_type = 'regional' AND coverage_scope IS NOT NULL AND coverage_value IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_feed_campaigns_pendentes
  ON public.feed_campaigns(payment_status, approval_status)
  WHERE status IN ('draft','scheduled');

-- `budget_cents` (campo antigo, livre) não é removido — toda campanha paga
-- nova grava budget_cents = total_price_cents na API, então feed/reports e
-- feed/dashboard continuam funcionando sem alteração.
