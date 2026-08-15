-- ============================================
-- Migration 062: Fundação geográfica do perfil
-- ============================================
-- Pré-requisito da segmentação de público do Feed.
--
-- Hoje a localização do profissional vive em dois lugares imprestáveis para
-- consulta: `profiles.address` (JSONB, formato inconsistente entre perfil e
-- parceiro) e `profiles.operating_region` (texto livre). Não há como filtrar
-- "profissionais de SP" sem varrer e adivinhar.
--
-- Isto precisa entrar ANTES de o Feed começar a registrar eventos: cada
-- evento guarda a UF do usuário no momento em que aconteceu. Evento gravado
-- sem UF não é recuperável depois — o recorte por estado nasceria vazio.

-- Municípios do IBGE. Sem uma tabela de referência, "cidade" é texto livre e
-- todo relatório por cidade agrupa por erro de digitação e acento.
CREATE TABLE IF NOT EXISTS public.br_cities (
  ibge_code   CHAR(7) PRIMARY KEY,
  name        TEXT NOT NULL,
  name_norm   TEXT NOT NULL,
  uf          CHAR(2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_br_cities_uf ON public.br_cities(uf);
CREATE INDEX IF NOT EXISTS idx_br_cities_norm ON public.br_cities(name_norm, uf);

COMMENT ON TABLE public.br_cities IS
  'Municípios do IBGE. Carregada uma vez por scripts/importar-municipios.mjs.';

ALTER TABLE public.br_cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos leem municipios" ON public.br_cities;
CREATE POLICY "Todos leem municipios" ON public.br_cities FOR SELECT USING (true);

-- Normalização no perfil.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS uf CHAR(2),
  ADD COLUMN IF NOT EXISTS city_name TEXT,
  ADD COLUMN IF NOT EXISTS city_ibge_code CHAR(7) REFERENCES public.br_cities(ibge_code),
  -- De onde o dado veio. Serve para saber o que é confiável e o que foi
  -- deduzido de texto livre.
  ADD COLUMN IF NOT EXISTS geo_source TEXT
    CHECK (geo_source IN ('address_jsonb','operating_region','manual','onboarding'));

CREATE INDEX IF NOT EXISTS idx_profiles_uf
  ON public.profiles(uf) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_profiles_city
  ON public.profiles(city_ibge_code) WHERE status = 'active';

COMMENT ON COLUMN public.profiles.uf IS
  'UF normalizada. NULL quando não foi possível determinar — NULL honesto é
   melhor que uma UF chutada, que envenena todo relatório por região.';

-- Mesma normalização para a loja.
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS uf CHAR(2),
  ADD COLUMN IF NOT EXISTS city_name TEXT,
  ADD COLUMN IF NOT EXISTS city_ibge_code CHAR(7) REFERENCES public.br_cities(ibge_code);

-- ---------------------------------------------------------------
-- Backfill a partir do que existe hoje.
-- ---------------------------------------------------------------
-- `address` é JSONB em profiles. Só aproveita o que já está em formato de
-- objeto com chave de estado; o resto fica NULL e entra na fila de
-- "perfis sem localização" no admin.
UPDATE public.profiles p
   SET uf = UPPER(TRIM(p.address->>'state')),
       city_name = NULLIF(TRIM(p.address->>'city'), ''),
       geo_source = 'address_jsonb'
 WHERE p.uf IS NULL
   AND jsonb_typeof(p.address) = 'object'
   AND COALESCE(TRIM(p.address->>'state'), '') <> ''
   AND LENGTH(TRIM(p.address->>'state')) = 2;

-- `operating_region` é texto livre. Só aceita quando o conteúdo inteiro é uma
-- sigla de UF — qualquer tentativa de extrair UF de frase é chute.
UPDATE public.profiles p
   SET uf = UPPER(TRIM(p.operating_region)),
       geo_source = 'operating_region'
 WHERE p.uf IS NULL
   AND p.operating_region IS NOT NULL
   AND LENGTH(TRIM(p.operating_region)) = 2
   AND UPPER(TRIM(p.operating_region)) ~ '^[A-Z]{2}$';

UPDATE public.partners pa
   SET uf = UPPER(TRIM(pa.address->>'state')),
       city_name = NULLIF(TRIM(pa.address->>'city'), '')
 WHERE pa.uf IS NULL
   AND jsonb_typeof(pa.address) = 'object'
   AND COALESCE(TRIM(pa.address->>'state'), '') <> ''
   AND LENGTH(TRIM(pa.address->>'state')) = 2;

-- Visão de apoio: quem ficou sem localização. O admin usa para cobrar o
-- preenchimento antes de a segmentação por região entrar em uso.
CREATE OR REPLACE VIEW public.perfis_sem_geo AS
SELECT id, full_name, email, role, operating_region, address
  FROM public.profiles
 WHERE status = 'active' AND uf IS NULL;
