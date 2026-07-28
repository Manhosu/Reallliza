-- ============================================
-- Migration 053: Expansao completa do Almoxarifado (Jessica 28/07)
-- ============================================
-- Aditivo do texto formal:
--   - Status novos de ferramenta (damaged, awaiting_evaluation, missing, reserved)
--   - Status novos de pedido (separating, awaiting_pickup, delivered)
--   - Campos expandidos no cadastro (patrimonio, brand, model)
--   - Tabela tool_maintenance dedicada
--   - Campos operacionais no custody (fotos entrega/devolucao)

BEGIN;

-- ============================================
-- 1) Enum tool_status: adiciona novos valores
-- ============================================
ALTER TYPE tool_status ADD VALUE IF NOT EXISTS 'damaged';
ALTER TYPE tool_status ADD VALUE IF NOT EXISTS 'awaiting_evaluation';
ALTER TYPE tool_status ADD VALUE IF NOT EXISTS 'missing';
ALTER TYPE tool_status ADD VALUE IF NOT EXISTS 'reserved';

-- ============================================
-- 2) Enum tool_request_status: adiciona fluxo intermediario
-- ============================================
ALTER TYPE tool_request_status ADD VALUE IF NOT EXISTS 'separating';
ALTER TYPE tool_request_status ADD VALUE IF NOT EXISTS 'awaiting_pickup';
ALTER TYPE tool_request_status ADD VALUE IF NOT EXISTS 'delivered';

-- ============================================
-- 3) Campos expandidos no cadastro
-- ============================================
ALTER TABLE public.tool_inventory
  ADD COLUMN IF NOT EXISTS patrimony_code TEXT,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tool_inventory.patrimony_code IS 'Codigo interno/patrimonio (Jessica 28/07)';
COMMENT ON COLUMN public.tool_inventory.brand IS 'Marca';
COMMENT ON COLUMN public.tool_inventory.model IS 'Modelo';
COMMENT ON COLUMN public.tool_inventory.photos IS 'Array [{url, name, storage_path}] de fotos multiplas';

CREATE INDEX IF NOT EXISTS idx_tool_inventory_patrimony
  ON public.tool_inventory(patrimony_code) WHERE patrimony_code IS NOT NULL;

-- ============================================
-- 4) Campos operacionais no custody (fotos + condicao detalhada)
-- ============================================
ALTER TABLE public.tool_custody
  ADD COLUMN IF NOT EXISTS photos_out JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photos_in JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.tool_custody.photos_out IS 'Fotos da ferramenta na entrega';
COMMENT ON COLUMN public.tool_custody.photos_in IS 'Fotos da ferramenta na devolucao';
COMMENT ON COLUMN public.tool_custody.delivered_by IS 'Operador do almoxarifado que entregou';
COMMENT ON COLUMN public.tool_custody.received_by IS 'Operador que recebeu de volta';

-- ============================================
-- 5) Tabela tool_maintenance (aba Manutencao dedicada)
-- ============================================
CREATE TABLE IF NOT EXISTS public.tool_maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id UUID NOT NULL REFERENCES public.tool_inventory(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsible_id UUID REFERENCES public.profiles(id),
  expected_return_at TIMESTAMPTZ,
  actual_return_at TIMESTAMPTZ,
  estimated_cost NUMERIC(10, 2),
  final_cost NUMERIC(10, 2),
  notes TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome TEXT, -- 'returned_available' | 'retired'
  outcome_notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tool_maintenance IS
  'Historico de manutencoes da ferramenta (Jessica 28/07). Cada envio pra manutencao gera 1 registro.';

CREATE INDEX IF NOT EXISTS idx_tool_maintenance_tool
  ON public.tool_maintenance(tool_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_maintenance_pending
  ON public.tool_maintenance(actual_return_at) WHERE actual_return_at IS NULL;

-- ============================================
-- 6) Tabela tool_retirement (aba Baixa dedicada)
-- ============================================
CREATE TABLE IF NOT EXISTS public.tool_retirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id UUID NOT NULL REFERENCES public.tool_inventory(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  responsible_id UUID REFERENCES public.profiles(id),
  notes TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  retired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tool_retirements IS
  'Registro de baixa/aposentadoria de ferramenta com motivo e comprovacao.';

CREATE INDEX IF NOT EXISTS idx_tool_retirements_tool
  ON public.tool_retirements(tool_id, retired_at DESC);

-- ============================================
-- 7) Storage bucket pra fotos de ferramenta
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tool-photos', 'tool-photos', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='auth_upload_tool_photos') THEN
    CREATE POLICY "auth_upload_tool_photos" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tool-photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='auth_read_tool_photos') THEN
    CREATE POLICY "auth_read_tool_photos" ON storage.objects
      FOR SELECT TO authenticated USING (bucket_id = 'tool-photos');
  END IF;
END $$;

COMMIT;
