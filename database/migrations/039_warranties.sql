-- ============================================
-- Migration 039: Garantias (Loja Parceira — Fase 3)
-- ============================================
-- Spec novosajustes.md: loja pode abrir solicitacao de garantia vinculada
-- a uma OS concluida, com descricao + fotos + videos. Admin gerencia e
-- pode converter em nova OS de assistencia.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warranty_status') THEN
    CREATE TYPE warranty_status AS ENUM (
      'open',           -- recem-criada pela loja
      'in_progress',    -- admin esta avaliando / OS de assistencia em andamento
      'resolved',       -- assistencia concluida ou aprovada como improcedente
      'rejected'        -- recusada (fora de prazo, mau uso, etc.)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.warranties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  opened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status warranty_status NOT NULL DEFAULT 'open',
  description TEXT NOT NULL,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{url, thumbnail_url, storage_path}]
  videos JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{url, storage_path}]
  notes TEXT,
  -- Assistencia gerada (admin pode criar nova OS a partir da garantia)
  assistance_service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warranties_service_order ON public.warranties(service_order_id);
CREATE INDEX IF NOT EXISTS idx_warranties_partner ON public.warranties(partner_id);
CREATE INDEX IF NOT EXISTS idx_warranties_status ON public.warranties(status);

CREATE TRIGGER set_updated_at_warranties
  BEFORE UPDATE ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

-- Loja so ve as proprias; admin ve tudo.
CREATE POLICY "Partner reads own warranties"
  ON public.warranties FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partners p
      WHERE p.id = warranties.partner_id AND p.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Partner creates own warranties"
  ON public.warranties FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partners p
      WHERE p.id = warranties.partner_id AND p.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin updates warranties"
  ON public.warranties FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Bucket de Storage pra fotos/videos de garantia
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'warranties',
  'warranties',
  true,
  209715200,  -- 200MB (videos)
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'
  ]
) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Auth upload warranties'
  ) THEN
    CREATE POLICY "Auth upload warranties"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'warranties' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Public read warranties'
  ) THEN
    CREATE POLICY "Public read warranties"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'warranties');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Admin delete warranties'
  ) THEN
    CREATE POLICY "Admin delete warranties"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'warranties' AND
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

COMMIT;
