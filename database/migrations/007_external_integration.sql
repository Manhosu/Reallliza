-- Migration: External Integration (Garantias → Enterprise)
-- Adds columns to service_orders so OSs can be linked back to an external system
-- (initially "GARANTIAS"), plus tables for API key auth and outbound webhook events.

-- ============================================================
-- 1. service_orders: external linkage columns
-- ============================================================
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS external_system TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS external_callback_url TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS external_metadata JSONB DEFAULT '{}'::jsonb;

-- Idempotency guard: same (system, id) can only be created once
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_external
  ON public.service_orders(external_system, external_id)
  WHERE external_system IS NOT NULL;

-- ============================================================
-- 2. api_keys: system-to-system authentication
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  system_identifier TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON public.api_keys(key_hash)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_api_keys_system
  ON public.api_keys(system_identifier)
  WHERE is_active = true;

-- ============================================================
-- 3. webhook_events: outbound webhook log + retry queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  http_status INT,
  response_body TEXT,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_service_order
  ON public.webhook_events(service_order_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
  ON public.webhook_events(next_attempt_at)
  WHERE delivered_at IS NULL;

-- ============================================================
-- 4. RLS: lock down api_keys & webhook_events (admin-only via service role)
-- ============================================================
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies created: only service_role (backend admin client) may read/write.

-- ============================================================
-- 5. Seed note (commented): create a "system" profile for integration-created OSs
-- ============================================================
-- Run ONCE per environment. Use an auth.users UUID you already provisioned or
-- insert directly into profiles if your schema allows a standalone row:
--
-- INSERT INTO public.profiles (id, full_name, email, role, status)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'Integration System',
--   'system@reallliza.internal',
--   'admin',
--   'active'
-- ) ON CONFLICT (id) DO NOTHING;
--
-- Then set env var EXTERNAL_INTEGRATION_USER_ID to the same UUID.
