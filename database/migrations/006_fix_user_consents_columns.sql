-- ============================================================
-- Migration 006: Fix user_consents table columns
-- The table was created before migration 005, so
-- CREATE TABLE IF NOT EXISTS skipped it, leaving old schema.
-- This adds all missing columns.
-- ============================================================

-- Fix user_consents - add missing columns
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS terms_version TEXT NOT NULL DEFAULT '1.0';
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS location_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS image_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.user_consents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure the updated_at trigger exists
DROP TRIGGER IF EXISTS set_user_consents_updated_at ON public.user_consents;
CREATE TRIGGER set_user_consents_updated_at
  BEFORE UPDATE ON public.user_consents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Ensure unique index on user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_consents_user ON public.user_consents(user_id);

-- Ensure RLS is enabled
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own consents" ON public.user_consents
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage own consents" ON public.user_consents
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all consents" ON public.user_consents
    FOR SELECT USING (get_user_role(auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
