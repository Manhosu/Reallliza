-- ============================================
-- Migration 020: Templates Nomeados de Etapas de Execução
-- ============================================
-- Substitui a abordagem de "applies_to_type" (INSTALACAO/PERICIA/GENERIC) por
-- templates nomeados (ex: "Instalação de Piso Vinílico Colado"). Operador
-- escolhe o template ao criar/editar a OS e, quando a OS é designada, as
-- etapas são instanciadas em os_step_executions copiando do template.

CREATE TABLE IF NOT EXISTS public.step_template_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.step_template_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.step_template_groups(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL,
  photos_required_min INT NOT NULL DEFAULT 1,
  final_photos_required_min INT NOT NULL DEFAULT 1,
  occurrence_enabled BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_step_key_per_group UNIQUE (group_id, step_key),
  CONSTRAINT unique_order_per_group UNIQUE (group_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_step_items_group
  ON public.step_template_items(group_id, order_index);

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS step_template_group_id UUID REFERENCES public.step_template_groups(id);

-- Colunas extras em os_step_executions: template_item_id (referência nova),
-- foto inicial/final separadas, ocorrência, executor + geolocalização inicial/final.
ALTER TABLE public.os_step_executions
  ADD COLUMN IF NOT EXISTS template_item_id UUID REFERENCES public.step_template_items(id),
  ADD COLUMN IF NOT EXISTS photo_initial_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_final_url TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_text TEXT,
  ADD COLUMN IF NOT EXISTS executor_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS started_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS started_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS completed_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS completed_lng NUMERIC;

-- Tornar template_id nullable porque novos registros usam template_item_id (legado mantido).
ALTER TABLE public.os_step_executions
  ALTER COLUMN template_id DROP NOT NULL;

CREATE TRIGGER set_updated_at_step_template_groups
  BEFORE UPDATE ON public.step_template_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.step_template_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read groups"
  ON public.step_template_groups FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage groups"
  ON public.step_template_groups FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated read items"
  ON public.step_template_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage items"
  ON public.step_template_items FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ============================================
-- Seeds: 2 templates iniciais (exemplo dado pela Jessica)
-- ============================================
DO $$
DECLARE
  g_piso UUID;
  g_painel UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.step_template_groups WHERE name = 'Instalação de Piso Vinílico Colado') THEN
    INSERT INTO public.step_template_groups (name, description) VALUES
      ('Instalação de Piso Vinílico Colado', 'Template padrão para instalação de pisos vinílicos colados.')
      RETURNING id INTO g_piso;

    INSERT INTO public.step_template_items
      (group_id, step_key, name, description, order_index, photos_required_min, final_photos_required_min, occurrence_enabled, is_required)
    VALUES
      (g_piso, 'LIMPEZA_BASE',    'Limpeza da base',         'Remova toda sujeira, poeira e residuos da base.', 1, 1, 1, true, true),
      (g_piso, 'PRIMER',          'Aplicação de primer',     'Aplique primer conforme especificacao do fabricante.', 2, 1, 1, true, true),
      (g_piso, 'AUTONIVELANTE',   'Aplicação de autonivelante', 'Aplique autonivelante e aguarde cura.', 3, 1, 1, true, true),
      (g_piso, 'LIXAMENTO',       'Lixamento',               'Lixe a superficie ate ficar uniforme.', 4, 1, 1, true, true),
      (g_piso, 'APLICACAO_PISO',  'Aplicação do piso',       'Cole as peças seguindo o paginamento.', 5, 2, 2, true, true),
      (g_piso, 'RODAPE',          'Instalação de rodapé',    'Instale o rodape no perimetro.', 6, 1, 1, true, true),
      (g_piso, 'LIMPEZA_FINAL',   'Limpeza final',           'Limpe e entregue a obra ao cliente.', 7, 1, 1, true, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.step_template_groups WHERE name = 'Instalação de Painel Vinílico') THEN
    INSERT INTO public.step_template_groups (name, description) VALUES
      ('Instalação de Painel Vinílico', 'Template para instalação de paineis vinilicos em parede.')
      RETURNING id INTO g_painel;

    INSERT INTO public.step_template_items
      (group_id, step_key, name, description, order_index, photos_required_min, final_photos_required_min, occurrence_enabled, is_required)
    VALUES
      (g_painel, 'CONFERENCIA_PAREDE',  'Conferência da parede',    'Verifique prumo, esquadro e umidade.', 1, 1, 1, true, true),
      (g_painel, 'LIMPEZA_SUPERFICIE',  'Limpeza da superfície',    'Remova poeira, gordura e residuos.', 2, 1, 1, true, true),
      (g_painel, 'MARCACAO',            'Marcação e alinhamento',   'Marque referencias com nivel a laser.', 3, 1, 1, true, true),
      (g_painel, 'COLA',                'Aplicação da cola',        'Aplique cola conforme fabricante.', 4, 1, 1, true, true),
      (g_painel, 'INSTALACAO_PAINEIS',  'Instalação dos painéis',   'Cole os paineis seguindo o paginamento.', 5, 2, 2, true, true),
      (g_painel, 'ACABAMENTOS',         'Acabamentos',              'Instale rodatetos, rodapes e cantos.', 6, 1, 1, true, true),
      (g_painel, 'LIMPEZA_FINAL',       'Limpeza final',            'Limpe e entregue ao cliente.', 7, 1, 1, true, true);
  END IF;
END $$;
