-- Cadastro autônomo de empresa (Loja/Fabricante) + aprovação com
-- provisionamento automático. Ver plano em
-- C:\Users\delas\.claude\plans\fa-a-tudo-e-analise-magical-pancake.md

CREATE TABLE IF NOT EXISTS public.company_signup_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_type TEXT NOT NULL CHECK (company_type IN ('loja', 'fabricante')),
  company_name TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  city_name TEXT,
  uf CHAR(2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  provisioned_partner_id UUID REFERENCES public.partners(id),
  provisioned_sponsor_id UUID REFERENCES public.feed_sponsors(id),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_signup_status
  ON public.company_signup_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_signup_profile
  ON public.company_signup_requests(profile_id);

ALTER TABLE public.company_signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam cadastros de empresa" ON public.company_signup_requests;
CREATE POLICY "Admins gerenciam cadastros de empresa"
  ON public.company_signup_requests FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- A partir de agora `authenticateRequest` bloqueia pending/inactive em toda
-- rota — a única forma de o próprio solicitante saber por que está
-- bloqueado é uma leitura direta via client do navegador (RLS), não pela
-- nossa API.
DROP POLICY IF EXISTS "Solicitante vê o próprio cadastro" ON public.company_signup_requests;
CREATE POLICY "Solicitante vê o próprio cadastro"
  ON public.company_signup_requests FOR SELECT
  USING (profile_id = auth.uid());

-- Provisiona loja (partners + feed_sponsors + feed_sponsor_users) ou
-- fabricante (só feed_sponsors + feed_sponsor_users) numa transação única —
-- uma falha no meio não pode deixar a empresa num estado pela metade.
CREATE OR REPLACE FUNCTION public.aprovar_cadastro_empresa(
  p_request_id UUID,
  p_reviewer_id UUID
) RETURNS TABLE(partner_id UUID, sponsor_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req company_signup_requests%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_partner_id UUID;
  v_sponsor_id UUID;
BEGIN
  SELECT * INTO v_req FROM company_signup_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou já analisada';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_req.profile_id;

  IF v_req.company_type = 'loja' THEN
    INSERT INTO partners (user_id, company_name, cnpj, contact_name, contact_phone, contact_email, uf, city_name, is_active)
    VALUES (v_req.profile_id, v_req.company_name, v_req.cnpj, v_profile.full_name, v_profile.phone, v_profile.email, v_req.uf, v_req.city_name, true)
    RETURNING id INTO v_partner_id;

    INSERT INTO feed_sponsors (name, legal_name, cnpj, sponsor_type, partner_id, contact_name, contact_email, contact_phone, created_by)
    VALUES (v_req.company_name, v_req.company_name, v_req.cnpj, 'loja', v_partner_id, v_profile.full_name, v_profile.email, v_profile.phone, p_reviewer_id)
    RETURNING id INTO v_sponsor_id;

    UPDATE profiles SET role = 'partner', status = 'active' WHERE id = v_req.profile_id;
  ELSE
    INSERT INTO feed_sponsors (name, legal_name, cnpj, sponsor_type, contact_name, contact_email, contact_phone, created_by)
    VALUES (v_req.company_name, v_req.company_name, v_req.cnpj, 'fabricante', v_profile.full_name, v_profile.email, v_profile.phone, p_reviewer_id)
    RETURNING id INTO v_sponsor_id;

    UPDATE profiles SET role = 'sponsor', status = 'active' WHERE id = v_req.profile_id;
  END IF;

  INSERT INTO feed_sponsor_users (sponsor_id, user_id, role)
  VALUES (v_sponsor_id, v_req.profile_id, 'admin')
  ON CONFLICT (sponsor_id, user_id) DO NOTHING;

  UPDATE company_signup_requests
     SET status = 'approved', reviewed_by = p_reviewer_id, reviewed_at = now(),
         provisioned_partner_id = v_partner_id, provisioned_sponsor_id = v_sponsor_id
   WHERE id = p_request_id;

  RETURN QUERY SELECT v_partner_id, v_sponsor_id;
END $$;
