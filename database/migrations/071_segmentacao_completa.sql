-- 071 — Os atributos que a segmentação pedia e não existiam
--
-- A comparação com a visão do Feed apontou quatro recortes pedidos que não
-- tinham onde morar: Região, Tipo de Piso, Certificações e Fabricante. Mais
-- dois números do painel — Solicitações de contato e Conversões — que não
-- tinham registro.
--
-- Uma decisão de fundo em cada um:
--
-- REGIÃO sai da UF, não de digitação. O cadastro `regions` que já existe é
-- outra coisa: área operacional com nome livre, por UF, usada na distribuição
-- de OS. Para segmentar campanha o que serve é a macro-região do IBGE, e ela
-- é função da UF. Fazer o administrador escolher região a mais seria pedir um
-- dado que o sistema já sabe deduzir — e criar duas verdades sobre o mesmo
-- profissional.
--
-- CERTIFICAÇÃO, TIPO DE PISO e FABRICANTE nascem como cadastro vazio, com
-- tela de administração. Tipo de piso vem semeado porque é vocabulário
-- técnico estável do setor; certificadora e fabricante são nomes de empresas
-- reais e quem preenche é a Reallliza, não eu.
--
-- LEAD é registro, não clique. "Solicitar Contato" e "Solicitar Amostra" só
-- valem dinheiro se virarem nome, telefone e origem. Clique já era contado e
-- não se cobra por clique.

-- ---------------------------------------------------------------
-- Macro-regiões, derivadas da UF
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.br_ufs (
  uf      CHAR(2) PRIMARY KEY,
  name    TEXT NOT NULL,
  region  TEXT NOT NULL CHECK (region IN ('Norte','Nordeste','Centro-Oeste','Sudeste','Sul'))
);

INSERT INTO public.br_ufs (uf, name, region) VALUES
  ('AC','Acre','Norte'),               ('AP','Amapá','Norte'),
  ('AM','Amazonas','Norte'),           ('PA','Pará','Norte'),
  ('RO','Rondônia','Norte'),           ('RR','Roraima','Norte'),
  ('TO','Tocantins','Norte'),
  ('AL','Alagoas','Nordeste'),         ('BA','Bahia','Nordeste'),
  ('CE','Ceará','Nordeste'),           ('MA','Maranhão','Nordeste'),
  ('PB','Paraíba','Nordeste'),         ('PE','Pernambuco','Nordeste'),
  ('PI','Piauí','Nordeste'),           ('RN','Rio Grande do Norte','Nordeste'),
  ('SE','Sergipe','Nordeste'),
  ('DF','Distrito Federal','Centro-Oeste'), ('GO','Goiás','Centro-Oeste'),
  ('MT','Mato Grosso','Centro-Oeste'), ('MS','Mato Grosso do Sul','Centro-Oeste'),
  ('ES','Espírito Santo','Sudeste'),   ('MG','Minas Gerais','Sudeste'),
  ('RJ','Rio de Janeiro','Sudeste'),   ('SP','São Paulo','Sudeste'),
  ('PR','Paraná','Sul'),               ('RS','Rio Grande do Sul','Sul'),
  ('SC','Santa Catarina','Sul')
ON CONFLICT (uf) DO NOTHING;

ALTER TABLE public.br_ufs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos leem ufs" ON public.br_ufs;
CREATE POLICY "Todos leem ufs" ON public.br_ufs FOR SELECT USING (true);

COMMENT ON TABLE public.br_ufs IS
  'UF -> macro-regiao do IBGE. Regiao e derivada, nunca digitada.';

-- ---------------------------------------------------------------
-- Tipo de piso — vocabulário técnico do setor
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.floor_types (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  family     TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.floor_types (name, slug, family, sort_order) VALUES
  ('Vinílico em régua (LVT)', 'vinilico-lvt',      'Vinílico', 1),
  ('Vinílico em manta',       'vinilico-manta',    'Vinílico', 2),
  ('Vinílico SPC',            'vinilico-spc',      'Vinílico', 3),
  ('Vinílico WPC',            'vinilico-wpc',      'Vinílico', 4),
  ('Laminado',                'laminado',          'Laminado', 5),
  ('Madeira maciça',          'madeira-macica',    'Madeira',  6),
  ('Madeira engenheirada',    'madeira-eng',       'Madeira',  7),
  ('Deck',                    'deck',              'Madeira',  8),
  ('Carpete em placa',        'carpete-placa',     'Têxtil',   9),
  ('Carpete em rolo',         'carpete-rolo',      'Têxtil',  10),
  ('Porcelanato',             'porcelanato',       'Cerâmico',11),
  ('Cerâmico',                'ceramico',          'Cerâmico',12),
  ('Piso elevado',            'piso-elevado',      'Técnico', 13),
  ('Piso vinílico hospitalar','vinilico-hospitalar','Técnico',14)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.profile_floor_types (
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  floor_type_id UUID NOT NULL REFERENCES public.floor_types(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, floor_type_id)
);
CREATE INDEX IF NOT EXISTS idx_pft_floor ON public.profile_floor_types(floor_type_id);

-- ---------------------------------------------------------------
-- Certificações
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  issuer      TEXT,
  description TEXT,
  -- Certificação que sai de curso da plataforma se concede sozinha na
  -- conclusão; a de fora entra por lançamento do administrador.
  course_id   UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profile_certifications (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  certification_id UUID NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  issued_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at       DATE,
  credential_code  TEXT,
  granted_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, certification_id)
);
CREATE INDEX IF NOT EXISTS idx_pcert_cert ON public.profile_certifications(certification_id);
-- A validade entra na chave do índice, não num predicado: CURRENT_DATE não é
-- imutável e o Postgres recusa índice parcial que dependa dela.
CREATE INDEX IF NOT EXISTS idx_pcert_validade
  ON public.profile_certifications(profile_id, expires_at);

-- ---------------------------------------------------------------
-- Fabricantes e o vínculo do profissional
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manufacturers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  cnpj       TEXT UNIQUE,
  logo_url   TEXT,
  website_url TEXT,
  -- Fabricante e patrocinador são papéis diferentes da mesma empresa: um é
  -- de quem o profissional instala, o outro é quem paga campanha.
  sponsor_id UUID REFERENCES public.feed_sponsors(id) ON DELETE SET NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profile_manufacturers (
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manufacturer_id UUID NOT NULL REFERENCES public.manufacturers(id) ON DELETE CASCADE,
  relationship    TEXT NOT NULL DEFAULT 'instala'
                  CHECK (relationship IN ('instala','credenciado','representante','preferencial')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, manufacturer_id)
);
CREATE INDEX IF NOT EXISTS idx_pman_man ON public.profile_manufacturers(manufacturer_id);

-- ---------------------------------------------------------------
-- Lead: o que o patrocinador realmente compra
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_leads (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  cta_id       UUID REFERENCES public.feed_post_ctas(id) ON DELETE SET NULL,
  campaign_id  UUID REFERENCES public.feed_campaigns(id) ON DELETE SET NULL,
  sponsor_id   UUID REFERENCES public.feed_sponsors(id) ON DELETE SET NULL,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  kind         TEXT NOT NULL DEFAULT 'contato'
               CHECK (kind IN ('contato','amostra','orcamento','revendedor','cupom','treinamento','outro')),
  -- Copiados do perfil no instante do pedido: o patrocinador recebe o dado
  -- como estava quando o profissional pediu, e mudança de cadastro depois
  -- não reescreve o histórico.
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  uf           CHAR(2),
  city_name    TEXT,
  message      TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::JSONB,

  status       TEXT NOT NULL DEFAULT 'novo'
               CHECK (status IN ('novo','em_contato','qualificado','convertido','descartado')),
  -- Conversão é o lead que virou negócio. É o numerador do painel.
  converted_at TIMESTAMPTZ,
  handled_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes        TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Um pedido por pessoa, por botão: reenviar o formulário não vira dois leads.
  UNIQUE (post_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_leads_post     ON public.feed_leads(post_id);
CREATE INDEX IF NOT EXISTS idx_leads_sponsor  ON public.feed_leads(sponsor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON public.feed_leads(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON public.feed_leads(status);

CREATE TRIGGER set_updated_at_feed_leads
  BEFORE UPDATE ON public.feed_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Marca a hora da conversão sozinha: relatório que depende de alguém lembrar
-- de preencher a data vira relatório errado.
CREATE OR REPLACE FUNCTION public.feed_lead_marcar_conversao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'convertido' AND NEW.converted_at IS NULL THEN
    NEW.converted_at := NOW();
  ELSIF NEW.status <> 'convertido' THEN
    NEW.converted_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_feed_lead_conversao ON public.feed_leads;
CREATE TRIGGER trg_feed_lead_conversao
  BEFORE INSERT OR UPDATE OF status ON public.feed_leads
  FOR EACH ROW EXECUTE FUNCTION public.feed_lead_marcar_conversao();

-- Contadores na publicação, para o painel não somar linha a linha.
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS lead_count       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_count INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.feed_lead_contadores()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_post UUID := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  UPDATE public.feed_posts p SET
    lead_count = (SELECT count(*) FROM public.feed_leads l WHERE l.post_id = v_post),
    conversion_count = (SELECT count(*) FROM public.feed_leads l
                         WHERE l.post_id = v_post AND l.status = 'convertido')
   WHERE p.id = v_post;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_feed_lead_contadores ON public.feed_leads;
CREATE TRIGGER trg_feed_lead_contadores
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.feed_leads
  FOR EACH STATEMENT EXECUTE FUNCTION public.feed_lead_contadores();

ALTER TABLE public.feed_leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_floor_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_certifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_manufacturers   ENABLE ROW LEVEL SECURITY;

-- Cadastros de referência são públicos para quem está autenticado; o vínculo
-- de cada pessoa e o lead ficam fechados (só service-role alcança).
DROP POLICY IF EXISTS "Autenticado le tipos de piso" ON public.floor_types;
CREATE POLICY "Autenticado le tipos de piso" ON public.floor_types
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "Autenticado le certificacoes" ON public.certifications;
CREATE POLICY "Autenticado le certificacoes" ON public.certifications
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "Autenticado le fabricantes" ON public.manufacturers;
CREATE POLICY "Autenticado le fabricantes" ON public.manufacturers
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "Profissional le os proprios tipos" ON public.profile_floor_types;
CREATE POLICY "Profissional le os proprios tipos" ON public.profile_floor_types
  FOR SELECT USING (profile_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Profissional le as proprias certificacoes" ON public.profile_certifications;
CREATE POLICY "Profissional le as proprias certificacoes" ON public.profile_certifications
  FOR SELECT USING (profile_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Profissional le os proprios fabricantes" ON public.profile_manufacturers;
CREATE POLICY "Profissional le os proprios fabricantes" ON public.profile_manufacturers
  FOR SELECT USING (profile_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------
-- A visão que o motor de audiência usa, agora com os quatro recortes
-- ---------------------------------------------------------------
-- Estende a definição da 067 sem mexer no que já funcionava: região vinda da
-- UF e os três vínculos novos. O resto é idêntico — inclusive a conversão de
-- especialidade por nome, que continua acontecendo num lugar só.
DROP VIEW IF EXISTS public.feed_audience_profile_v;
CREATE VIEW public.feed_audience_profile_v
WITH (security_invoker = on) AS
SELECT
  p.id                                   AS user_id,
  p.role::TEXT                           AS role,
  p.status::TEXT                         AS status,
  p.uf,
  ufs.region,
  p.city_ibge_code,
  p.professional_type,
  p.is_homologated,
  p.level,
  p.overall_score,
  EXTRACT(DAY FROM NOW() - p.created_at)::INT AS days_since_signup,
  COALESCE(sp.specialty_ids, '{}'::UUID[])    AS specialty_ids,
  COALESCE(ce.course_ids,    '{}'::UUID[])    AS completed_course_ids,
  COALESCE(tm.team_ids,      '{}'::UUID[])    AS team_ids,
  COALESCE(pa.partner_ids,   '{}'::UUID[])    AS partner_ids,
  COALESCE(ft.floor_type_ids,'{}'::UUID[])    AS floor_type_ids,
  COALESCE(ct.cert_ids,      '{}'::UUID[])    AS certification_ids,
  COALESCE(mf.manufacturer_ids,'{}'::UUID[])  AS manufacturer_ids
FROM public.profiles p
LEFT JOIN public.br_ufs ufs ON ufs.uf = p.uf
LEFT JOIN LATERAL (
  -- profiles.specialties é TEXT[] de NOMES; a segmentação usa id. Casar por
  -- nome é frágil com acento, então a conversão fica aqui, num lugar só.
  SELECT array_agg(s.id) AS specialty_ids
    FROM public.specialties s
   WHERE p.specialties IS NOT NULL AND s.name = ANY(p.specialties)
) sp ON true
LEFT JOIN LATERAL (
  SELECT array_agg(e.course_id) AS course_ids
    FROM public.course_enrollments e
   WHERE e.user_id = p.id AND e.status = 'completed'
) ce ON true
LEFT JOIN LATERAL (
  SELECT array_agg(m.team_id) AS team_ids
    FROM public.team_members m
   WHERE m.technician_id = p.id
) tm ON true
LEFT JOIN LATERAL (
  SELECT array_agg(pt.id) AS partner_ids
    FROM public.partners pt
   WHERE pt.user_id = p.id
) pa ON true
LEFT JOIN LATERAL (
  SELECT array_agg(f.floor_type_id) AS floor_type_ids
    FROM public.profile_floor_types f
   WHERE f.profile_id = p.id
) ft ON true
LEFT JOIN LATERAL (
  -- Certificação vencida não segmenta: quem perdeu a validade não é
  -- "certificado" para efeito de campanha.
  SELECT array_agg(c.certification_id) AS cert_ids
    FROM public.profile_certifications c
   WHERE c.profile_id = p.id
     AND (c.expires_at IS NULL OR c.expires_at >= CURRENT_DATE)
) ct ON true
LEFT JOIN LATERAL (
  SELECT array_agg(m.manufacturer_id) AS manufacturer_ids
    FROM public.profile_manufacturers m
   WHERE m.profile_id = p.id
) mf ON true
WHERE p.status = 'active';

REVOKE ALL ON public.feed_audience_profile_v FROM anon, authenticated;
COMMENT ON VIEW public.feed_audience_profile_v IS
  'Uso interno do motor de audiencia. Sem acesso por anon/authenticated: expoe recorte pessoal.';

-- Fila de perfis incompletos, agora medindo o que a segmentação precisa.
-- Antes listava só quem não tinha UF. Agora mede tudo que a segmentação
-- precisa, porque o buraco de cidade é maior que o de estado e ninguém
-- estava vendo.
DROP VIEW IF EXISTS public.perfis_sem_geo;
CREATE VIEW public.perfis_sem_geo
WITH (security_invoker = on) AS
SELECT p.id, p.full_name, p.email, p.role::TEXT AS role,
       p.operating_region, p.address,
       (p.uf IS NULL)             AS falta_uf,
       (p.city_ibge_code IS NULL) AS falta_cidade,
       NOT EXISTS (SELECT 1 FROM public.profile_floor_types f WHERE f.profile_id = p.id)
                                  AS falta_tipo_de_piso
  FROM public.profiles p
 WHERE p.status = 'active'
   AND (p.uf IS NULL OR p.city_ibge_code IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.profile_floor_types f WHERE f.profile_id = p.id));

REVOKE ALL ON public.perfis_sem_geo FROM anon, authenticated;
COMMENT ON VIEW public.perfis_sem_geo IS
  'Uso interno: fila de cadastro incompleto para a segmentacao. Sem acesso por anon/authenticated.';

NOTIFY pgrst, 'reload schema';
