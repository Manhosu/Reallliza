-- ============================================
-- Migration 037: Reallliza Settings + Service Estimates + Catalogo Photos
-- ============================================
-- Spec novosajustes.md (Loja Parceira):
--  - company_settings: singleton (base address/state, R$/km, multiplicador
--    horario especial, taxa plataforma, horario comercial)
--  - state_stay_rates: estadia por UF
--  - public_holidays: feriados nacionais BR
--  - services: ganha estimated_time_hours + photos (JSONB) pra orcamento
--    calcular dias e pra catalogo visual.

BEGIN;

-- ============================================
-- company_settings (singleton)
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Endereco base da Reallliza (origem do deslocamento)
  base_address TEXT,
  base_lat NUMERIC(10, 7),
  base_lng NUMERIC(10, 7),
  base_state CHAR(2),
  -- Precificacao
  price_per_km NUMERIC(8, 2) NOT NULL DEFAULT 1.50,
  special_hour_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.25
    CHECK (special_hour_multiplier >= 1.00 AND special_hour_multiplier <= 3.00),
  platform_fee_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.00
    CHECK (platform_fee_pct >= 0 AND platform_fee_pct <= 100),
  -- Horario comercial (pra detectar fora do expediente)
  business_hour_start TIME NOT NULL DEFAULT '08:00',
  business_hour_end TIME NOT NULL DEFAULT '18:00',
  -- Singleton lock — apenas 1 row permitida
  is_singleton BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_settings_singleton_uk UNIQUE (is_singleton)
);

CREATE TRIGGER set_updated_at_company_settings
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default row (Reallliza Sao Paulo)
INSERT INTO public.company_settings (
  base_address, base_state, price_per_km, special_hour_multiplier, platform_fee_pct
) VALUES (
  'Av. Brasil, 1234 - Centro - Sao Paulo/SP',
  'SP',
  1.50,
  1.25,
  10.00
) ON CONFLICT (is_singleton) DO NOTHING;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Leitura: todos autenticados (orcamento precisa dos valores)
CREATE POLICY "Authenticated read company_settings"
  ON public.company_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Escrita: apenas admin
CREATE POLICY "Admin write company_settings"
  ON public.company_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================
-- state_stay_rates (estadia por UF)
-- ============================================
CREATE TABLE IF NOT EXISTS public.state_stay_rates (
  state CHAR(2) PRIMARY KEY,
  state_name TEXT NOT NULL,
  daily_rate NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_state_stay_rates
  BEFORE UPDATE ON public.state_stay_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed completo dos 27 estados com valor zero (admin ajusta no painel)
INSERT INTO public.state_stay_rates (state, state_name, daily_rate) VALUES
  ('AC', 'Acre', 0), ('AL', 'Alagoas', 0), ('AP', 'Amapá', 0),
  ('AM', 'Amazonas', 0), ('BA', 'Bahia', 0), ('CE', 'Ceará', 0),
  ('DF', 'Distrito Federal', 0), ('ES', 'Espírito Santo', 0),
  ('GO', 'Goiás', 0), ('MA', 'Maranhão', 0), ('MT', 'Mato Grosso', 0),
  ('MS', 'Mato Grosso do Sul', 0), ('MG', 'Minas Gerais', 0),
  ('PA', 'Pará', 0), ('PB', 'Paraíba', 0), ('PR', 'Paraná', 0),
  ('PE', 'Pernambuco', 0), ('PI', 'Piauí', 0), ('RJ', 'Rio de Janeiro', 0),
  ('RN', 'Rio Grande do Norte', 0), ('RS', 'Rio Grande do Sul', 0),
  ('RO', 'Rondônia', 0), ('RR', 'Roraima', 0), ('SC', 'Santa Catarina', 0),
  ('SP', 'São Paulo', 0), ('SE', 'Sergipe', 0), ('TO', 'Tocantins', 0)
ON CONFLICT (state) DO NOTHING;

ALTER TABLE public.state_stay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read state_stay_rates"
  ON public.state_stay_rates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin write state_stay_rates"
  ON public.state_stay_rates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================
-- public_holidays
-- ============================================
CREATE TABLE IF NOT EXISTS public.public_holidays (
  date DATE PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_national BOOLEAN NOT NULL DEFAULT TRUE,
  state CHAR(2),  -- NULL = nacional; preenchido = feriado regional
  source TEXT NOT NULL DEFAULT 'manual',  -- manual | brasilapi | csv
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_public_holidays
  BEFORE UPDATE ON public.public_holidays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_public_holidays_active
  ON public.public_holidays (date) WHERE is_active = TRUE;

-- Seed feriados nacionais BR 2026
INSERT INTO public.public_holidays (date, name, source) VALUES
  ('2026-01-01', 'Confraternização Universal', 'manual'),
  ('2026-02-16', 'Carnaval (segunda)', 'manual'),
  ('2026-02-17', 'Carnaval (terça)', 'manual'),
  ('2026-04-03', 'Sexta-feira Santa', 'manual'),
  ('2026-04-21', 'Tiradentes', 'manual'),
  ('2026-05-01', 'Dia do Trabalho', 'manual'),
  ('2026-06-04', 'Corpus Christi', 'manual'),
  ('2026-09-07', 'Independência do Brasil', 'manual'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'manual'),
  ('2026-11-02', 'Finados', 'manual'),
  ('2026-11-15', 'Proclamação da República', 'manual'),
  ('2026-11-20', 'Consciência Negra', 'manual'),
  ('2026-12-25', 'Natal', 'manual')
ON CONFLICT (date) DO NOTHING;

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read public_holidays"
  ON public.public_holidays FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin write public_holidays"
  ON public.public_holidays FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================
-- services: estimated_time_hours + photos
-- ============================================
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS estimated_time_hours NUMERIC(8, 3) NOT NULL DEFAULT 0
    CHECK (estimated_time_hours >= 0),
  ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================
-- quotes: campos completos de cliente + endereco (spec Loja Parceira)
-- ============================================
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS client_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS client_document TEXT,
  ADD COLUMN IF NOT EXISTS address_number TEXT,
  ADD COLUMN IF NOT EXISTS address_complement TEXT,
  ADD COLUMN IF NOT EXISTS address_neighborhood TEXT;

COMMENT ON COLUMN public.quotes.client_document IS
  'CPF (11 digitos) ou CNPJ (14 digitos), apenas numeros. Validacao no app.';

COMMENT ON COLUMN public.services.estimated_time_hours IS
  'Horas estimadas por unidade. Ex: 0.10 = 6min/m². Orçamento multiplica por quantity pra somar duração total.';
COMMENT ON COLUMN public.services.photos IS
  'Array JSONB: [{url, thumbnail_url, position, alt_text}]. Storage em bucket service-catalog.';

COMMIT;

-- ============================================
-- Bucket de storage (fora da transacao — Supabase storage tem schema proprio)
-- ============================================
-- Bucket de fotos do catalogo de servicos. Public read pra exibir no orcamento.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-catalog',
  'service-catalog',
  true,
  10485760,  -- 10MB por arquivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Policy: upload e delete apenas admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Admin upload service-catalog'
  ) THEN
    CREATE POLICY "Admin upload service-catalog"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'service-catalog' AND
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Admin delete service-catalog'
  ) THEN
    CREATE POLICY "Admin delete service-catalog"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'service-catalog' AND
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Public read service-catalog'
  ) THEN
    CREATE POLICY "Public read service-catalog"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'service-catalog');
  END IF;
END $$;
