-- ============================================
-- Migration 021: Catálogo de Serviços Operacionais
-- ============================================
-- Marco 6 / Bloco 1 — catálogo de serviços gerenciável por painel admin,
-- sem código nem SQL. Categorias + serviços com preço comercial (quanto a
-- loja parceira paga) e preço de repasse (quanto o profissional recebe).
-- Base para o orçamento da loja parceira (Bloco 4).

CREATE TABLE IF NOT EXISTS public.service_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'm2',
  commercial_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commercial_price >= 0),
  payout_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (payout_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(is_active);

CREATE TRIGGER set_updated_at_service_categories
  BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_services
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado lê o catálogo; só admin gerencia.
CREATE POLICY "Authenticated read service_categories"
  ON public.service_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage service_categories"
  ON public.service_categories FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated read services"
  ON public.services FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage services"
  ON public.services FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
