-- ============================================================
-- Migration 005: Missing features from spec
-- Feed Corporativo, Avaliação Interna, Termos de Uso,
-- Rastreamento, Propostas para Parceiros, Região de Atuação
-- ============================================================

-- 1. Feed Corporativo
CREATE TYPE public.feed_audience AS ENUM ('all', 'employees', 'partners');

CREATE TABLE public.feed_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  audience feed_audience NOT NULL DEFAULT 'all',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feed_posts_audience ON public.feed_posts(audience);
CREATE INDEX idx_feed_posts_pinned ON public.feed_posts(is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_feed_posts_created_at ON public.feed_posts(created_at DESC);

CREATE TRIGGER set_feed_posts_updated_at
  BEFORE UPDATE ON public.feed_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage feed posts" ON public.feed_posts
  FOR ALL USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can view published feed posts" ON public.feed_posts
  FOR SELECT USING (
    is_published = true
    AND (
      audience = 'all'
      OR (audience = 'employees' AND get_user_role(auth.uid()) IN ('admin', 'technician'))
      OR (audience = 'partners' AND get_user_role(auth.uid()) IN ('admin', 'partner'))
    )
  );

-- 2. Sistema de Avaliação Interna de Profissionais
CREATE TABLE public.professional_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rated_by UUID NOT NULL REFERENCES public.profiles(id),
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  quality_score SMALLINT NOT NULL CHECK (quality_score BETWEEN 1 AND 5),
  punctuality_score SMALLINT NOT NULL CHECK (punctuality_score BETWEEN 1 AND 5),
  organization_score SMALLINT NOT NULL CHECK (organization_score BETWEEN 1 AND 5),
  communication_score SMALLINT NOT NULL CHECK (communication_score BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ratings_professional ON public.professional_ratings(professional_id);
CREATE INDEX idx_ratings_service_order ON public.professional_ratings(service_order_id);

ALTER TABLE public.professional_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ratings" ON public.professional_ratings
  FOR ALL USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Managers can view and create ratings" ON public.professional_ratings
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'technician'));

-- 3. Aceite de Termos de Uso
CREATE TABLE public.user_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL DEFAULT '1.0',
  terms_accepted_at TIMESTAMPTZ,
  privacy_accepted_at TIMESTAMPTZ,
  location_consent BOOLEAN NOT NULL DEFAULT false,
  image_consent BOOLEAN NOT NULL DEFAULT false,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_consents_user ON public.user_consents(user_id);

CREATE TRIGGER set_user_consents_updated_at
  BEFORE UPDATE ON public.user_consents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consents" ON public.user_consents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own consents" ON public.user_consents
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all consents" ON public.user_consents
  FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

-- 4. Rastreamento de Localização
CREATE TABLE public.technician_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tech_locations_user ON public.technician_locations(user_id);
CREATE INDEX idx_tech_locations_recorded ON public.technician_locations(recorded_at DESC);
CREATE INDEX idx_tech_locations_so ON public.technician_locations(service_order_id);

ALTER TABLE public.technician_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Technicians can insert own location" ON public.technician_locations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all locations" ON public.technician_locations
  FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can view own locations" ON public.technician_locations
  FOR SELECT USING (auth.uid() = user_id);

-- 5. Propostas/Chamados para Parceiros
CREATE TYPE public.proposal_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');

CREATE TABLE public.service_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES public.profiles(id),
  status proposal_status NOT NULL DEFAULT 'pending',
  proposed_value DECIMAL(12,2),
  message TEXT,
  response_message TEXT,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_so ON public.service_proposals(service_order_id);
CREATE INDEX idx_proposals_partner ON public.service_proposals(partner_id);
CREATE INDEX idx_proposals_status ON public.service_proposals(status);

CREATE TRIGGER set_proposals_updated_at
  BEFORE UPDATE ON public.service_proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.service_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage proposals" ON public.service_proposals
  FOR ALL USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Partners can view own proposals" ON public.service_proposals
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

CREATE POLICY "Partners can update own proposals" ON public.service_proposals
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

-- 6. Adicionar campo de região de atuação ao profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS operating_region TEXT;

-- 7. Adicionar tracking_token às service_orders para link público
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS tracking_token UUID DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX IF NOT EXISTS idx_so_tracking_token ON public.service_orders(tracking_token);

-- 8. Criar bucket para media do feed (se não existir, executar no dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('feed-media', 'feed-media', true);
