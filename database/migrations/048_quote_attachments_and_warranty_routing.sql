-- ============================================
-- Migration 048: Anexos no orcamento + roteamento auto de garantia
-- ============================================
-- Jessica 16/07:
--   1) quote ganha anexos (planta baixa, lista de materiais) e warnings
--      persistidos do calculator
--   2) warranty ganha executor_type + assigned_technician_id pra rotear
--      automaticamente pra fila do homologado quando ele executou a OS
--   3) Bucket 'quote-files' pra armazenar planta/lista

BEGIN;

-- ============================================
-- 1) Anexos em quotes
-- ============================================
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS project_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS material_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS calculator_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.quotes.project_files IS
  'Array [{url, name, storage_path}] — planta/projeto anexado pela loja no orcamento';
COMMENT ON COLUMN public.quotes.material_files IS
  'Array [{url, name, storage_path}] — lista de materiais anexada pela loja';
COMMENT ON COLUMN public.quotes.calculator_warnings IS
  'Array de strings — warnings do calculator (geocode falhou, centro-UF fallback etc.)';

-- ============================================
-- 2) Roteamento de garantia por executor
-- ============================================
DO $$ BEGIN
  CREATE TYPE warranty_executor_type AS ENUM ('reallliza', 'homologado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.warranties
  ADD COLUMN IF NOT EXISTS executor_type warranty_executor_type,
  ADD COLUMN IF NOT EXISTS assigned_technician_id UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.warranties.executor_type IS
  'Quem executou a OS de origem — determina fila de garantia (reallliza vs homologado)';
COMMENT ON COLUMN public.warranties.assigned_technician_id IS
  'ID do tecnico/homologado dono da execucao — pra homologado filtrar suas garantias';

CREATE INDEX IF NOT EXISTS idx_warranties_assigned_technician
  ON public.warranties (assigned_technician_id) WHERE assigned_technician_id IS NOT NULL;

-- Novo tipo de notificacao pra homologado ser avisado
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'warranty_opened';

-- ============================================
-- 3) Bucket quote-files
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('quote-files', 'quote-files', false, 20971520,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv','image/vnd.dwg','application/acad',
        'application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- Policies: autenticado envia; leitura autenticada
DO $$ BEGIN
  CREATE POLICY "auth_upload_quote_files" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'quote-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth_read_quote_files" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'quote-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth_delete_quote_files" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'quote-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
