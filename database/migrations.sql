-- ============================================================
-- REALLLIZA REVESTIMENTOS - MIGRATIONS
-- ============================================================
-- Run this AFTER the initial schema.sql has been executed.
-- Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT).
-- ============================================================


-- ============================================================
-- SECTION 1: FIX ENUM MISMATCHES
-- ============================================================
-- The application code uses status values that differ from the
-- original schema enums. We add the missing values here.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction
-- in some PostgreSQL versions. In Supabase SQL Editor this is fine.
-- ============================================================

-- 1a. os_status - add values the app uses that the DB lacks
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'rejected';

-- 1b. photo_type - add 'issue' and 'signature'
ALTER TYPE photo_type ADD VALUE IF NOT EXISTS 'issue';
ALTER TYPE photo_type ADD VALUE IF NOT EXISTS 'signature';

-- 1c. user_status - add 'pending' for new user sign-up flows
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'pending';


-- ============================================================
-- SECTION 2: FIX CHECKLIST TABLE COLUMN MISMATCHES
-- ============================================================
-- The app expects different column names/structures than the
-- original schema defined. We add the missing columns so both
-- the old and new columns coexist (backward-compatible).
-- ============================================================

-- 2a. checklist_templates: rename 'fields' -> 'items'
-- We add an 'items' column and copy data, keeping 'fields' for safety.
DO $$
BEGIN
  -- Add 'items' column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checklist_templates'
      AND column_name = 'items'
  ) THEN
    ALTER TABLE public.checklist_templates ADD COLUMN items JSONB NOT NULL DEFAULT '[]';
    -- Copy existing data from 'fields' to 'items'
    UPDATE public.checklist_templates SET items = fields WHERE fields IS NOT NULL;
  END IF;
END $$;

-- 2b. checklists: add missing columns the app expects
-- App expects: title, items (jsonb), completed_by
-- DB has: data (jsonb), technician_id, is_completed, notes

DO $$
BEGIN
  -- Add 'title' column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checklists'
      AND column_name = 'title'
  ) THEN
    ALTER TABLE public.checklists ADD COLUMN title TEXT;
  END IF;

  -- Add 'items' column (app uses this instead of 'data')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checklists'
      AND column_name = 'items'
  ) THEN
    ALTER TABLE public.checklists ADD COLUMN items JSONB NOT NULL DEFAULT '[]';
    -- Copy existing data from 'data' to 'items'
    UPDATE public.checklists SET items = data WHERE data IS NOT NULL AND data != '{}'::jsonb;
  END IF;

  -- Add 'completed_by' column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checklists'
      AND column_name = 'completed_by'
  ) THEN
    ALTER TABLE public.checklists ADD COLUMN completed_by UUID REFERENCES public.profiles(id);
    -- Backfill completed_by from technician_id for already-completed checklists
    UPDATE public.checklists SET completed_by = technician_id WHERE is_completed = true AND completed_at IS NOT NULL;
  END IF;
END $$;


-- ============================================================
-- SECTION 3: SUPABASE STORAGE BUCKETS & POLICIES
-- ============================================================

-- 3a. Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('photos', 'photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('documents', 'documents', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 3b. Storage policies for 'photos' bucket (public read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload photos'
  ) THEN
    CREATE POLICY "Authenticated users can upload photos" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Anyone can view photos'
  ) THEN
    CREATE POLICY "Anyone can view photos" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can delete own photos'
  ) THEN
    CREATE POLICY "Users can delete own photos" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'photos');
  END IF;
END $$;

-- 3c. Storage policies for 'documents' bucket (private)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload documents'
  ) THEN
    CREATE POLICY "Authenticated users can upload documents" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users can view documents'
  ) THEN
    CREATE POLICY "Authenticated users can view documents" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'documents');
  END IF;
END $$;

-- 3d. Storage policies for 'avatars' bucket (public read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload avatars'
  ) THEN
    CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Anyone can view avatars'
  ) THEN
    CREATE POLICY "Anyone can view avatars" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can update own avatar'
  ) THEN
    CREATE POLICY "Users can update own avatar" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'avatars');
  END IF;
END $$;


-- ============================================================
-- SECTION 4: ADDITIONAL RLS POLICIES
-- ============================================================
-- Ensure any tables that may have been missed have RLS enabled
-- and basic policies in place.
-- ============================================================

-- The original schema already enables RLS on all tables and has
-- comprehensive policies. The following adds an INSERT policy for
-- os_status_history that might be needed by the backend when
-- recording status transitions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'os_status_history'
      AND policyname = 'System can create status history'
  ) THEN
    CREATE POLICY "System can create status history" ON public.os_status_history
      FOR INSERT WITH CHECK (true);
  END IF;

  -- Allow technicians to also view their own schedule entries
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'schedules'
      AND policyname = 'Technicians can update own schedule'
  ) THEN
    CREATE POLICY "Technicians can update own schedule" ON public.schedules
      FOR UPDATE USING (technician_id = auth.uid());
  END IF;
END $$;


-- ============================================================
-- SECTION 5: NEW TABLES (Push Notifications, LGPD, Consents)
-- ============================================================

-- 5a. Device tokens for push notifications
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'device_tokens'
      AND policyname = 'Users manage own device tokens'
  ) THEN
    CREATE POLICY "Users manage own device tokens" ON public.device_tokens
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

-- 5b. User consents for LGPD compliance
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_accepted BOOLEAN NOT NULL DEFAULT false,
  privacy_accepted BOOLEAN NOT NULL DEFAULT false,
  marketing_accepted BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_consents'
      AND policyname = 'Users manage own consent'
  ) THEN
    CREATE POLICY "Users manage own consent" ON public.user_consents
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- 5c. LGPD anonymization requests
CREATE TABLE IF NOT EXISTS public.lgpd_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  type TEXT NOT NULL DEFAULT 'anonymization' CHECK (type IN ('anonymization', 'data_export', 'data_deletion')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  processed_by UUID REFERENCES public.profiles(id),
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lgpd_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lgpd_requests'
      AND policyname = 'Users can view own LGPD requests'
  ) THEN
    CREATE POLICY "Users can view own LGPD requests" ON public.lgpd_requests
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lgpd_requests'
      AND policyname = 'Users can create LGPD requests'
  ) THEN
    CREATE POLICY "Users can create LGPD requests" ON public.lgpd_requests
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lgpd_requests'
      AND policyname = 'Admins manage all LGPD requests'
  ) THEN
    CREATE POLICY "Admins manage all LGPD requests" ON public.lgpd_requests
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lgpd_requests_user ON public.lgpd_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_status ON public.lgpd_requests(status);

-- 5d. Add missing columns to photos table if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'description'
  ) THEN
    ALTER TABLE public.photos ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE public.photos ADD COLUMN uploaded_by UUID REFERENCES public.profiles(id);
  END IF;
END $$;


-- ============================================================
-- SECTION 6: ADDITIONAL INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================
-- Many of these already exist in the original schema.
-- Using IF NOT EXISTS ensures we only add truly missing ones.
-- ============================================================

-- Composite index for schedules by technician + date
CREATE INDEX IF NOT EXISTS idx_schedules_technician_date ON public.schedules(technician_id, date);

-- Composite index for notifications by user + read status
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read_at);

-- Partial index for active tool custody (tools currently checked out)
CREATE INDEX IF NOT EXISTS idx_tool_custody_active ON public.tool_custody(tool_id) WHERE checked_in_at IS NULL;

-- Composite index for photos by service order + type
CREATE INDEX IF NOT EXISTS idx_photos_service_order_type ON public.photos(service_order_id, type);

-- Checklists by service order (may already exist, safe to re-run)
CREATE INDEX IF NOT EXISTS idx_checklists_service_order ON public.checklists(service_order_id);

-- Audit logs by entity (already exists in schema, kept for safety)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- OS status history by service order (already exists, kept for safety)
CREATE INDEX IF NOT EXISTS idx_os_status_history_os ON public.os_status_history(service_order_id);


-- ============================================================
-- SECTION 7: TRIGGERS FOR updated_at ON NEW TABLES
-- ============================================================

-- Reuse the trigger function from schema.sql (update_updated_at_column)
-- Apply to new tables

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_device_tokens_updated_at'
      AND event_object_table = 'device_tokens'
  ) THEN
    CREATE TRIGGER update_device_tokens_updated_at
      BEFORE UPDATE ON public.device_tokens
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_user_consents_updated_at'
      AND event_object_table = 'user_consents'
  ) THEN
    CREATE TRIGGER update_user_consents_updated_at
      BEFORE UPDATE ON public.user_consents
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_lgpd_requests_updated_at'
      AND event_object_table = 'lgpd_requests'
  ) THEN
    CREATE TRIGGER update_lgpd_requests_updated_at
      BEFORE UPDATE ON public.lgpd_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


-- ============================================================
-- SECTION 8: OPTIMISTIC LOCKING (Version columns)
-- ============================================================

ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Function to auto-increment version on update
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply version trigger to service_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'increment_service_orders_version'
      AND event_object_table = 'service_orders'
  ) THEN
    CREATE TRIGGER increment_service_orders_version
      BEFORE UPDATE ON public.service_orders
      FOR EACH ROW EXECUTE FUNCTION increment_version();
  END IF;
END $$;

-- Apply version trigger to checklists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'increment_checklists_version'
      AND event_object_table = 'checklists'
  ) THEN
    CREATE TRIGGER increment_checklists_version
      BEFORE UPDATE ON public.checklists
      FOR EACH ROW EXECUTE FUNCTION increment_version();
  END IF;
END $$;


-- ============================================================
-- DONE
-- ============================================================
-- All migrations applied. This file is idempotent and can be
-- executed again without errors.
-- ============================================================
