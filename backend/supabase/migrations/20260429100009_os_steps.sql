-- ============================================
-- Migration 009: Etapas Obrigatórias da OS
-- ============================================
-- Manual da Jessica seção 6: "Execução por etapas obrigatórias"
-- Cada OS tem um modelo de execução. Técnico não pode pular etapas
-- nem finalizar OS sem todas concluídas.

-- Templates globais por tipo de OS
CREATE TABLE IF NOT EXISTS public.os_step_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  applies_to_type TEXT NOT NULL DEFAULT 'GENERIC', -- 'INSTALACAO' | 'PERICIA' | 'GENERIC'
  order_index INT NOT NULL DEFAULT 0,
  requires_photos_min INT NOT NULL DEFAULT 0,
  requires_notes BOOLEAN NOT NULL DEFAULT false,
  requires_signature BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_step_key_per_type UNIQUE (step_key, applies_to_type)
);

-- Estado de execução por OS
CREATE TABLE IF NOT EXISTS public.os_step_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.os_step_templates(id) ON DELETE RESTRICT,
  step_key TEXT NOT NULL,
  order_index INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed' | 'skipped'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  photos_count INT NOT NULL DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_step_per_os UNIQUE (service_order_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_os_step_executions_order
  ON public.os_step_executions(service_order_id);
CREATE INDEX IF NOT EXISTS idx_os_step_executions_status
  ON public.os_step_executions(service_order_id, status);
CREATE INDEX IF NOT EXISTS idx_os_step_templates_type
  ON public.os_step_templates(applies_to_type, order_index)
  WHERE is_active = true;

-- ============================================
-- Seed: 4 etapas padrão para INSTALACAO
-- ============================================
INSERT INTO public.os_step_templates
  (step_key, name, description, applies_to_type, order_index, requires_photos_min, requires_notes, requires_signature)
VALUES
  ('FOTO_INICIAL', 'Foto Inicial', 'Registre fotos da situação encontrada antes de qualquer intervenção.', 'INSTALACAO', 1, 2, true, false),
  ('PREPARACAO', 'Preparação', 'Foto da preparação do ambiente e checklist de pré-execução.', 'INSTALACAO', 2, 1, false, false),
  ('EXECUCAO', 'Execução', 'Fotos durante a execução e observações técnicas.', 'INSTALACAO', 3, 2, true, false),
  ('FINALIZACAO', 'Finalização', 'Fotos do resultado final e assinatura do cliente.', 'INSTALACAO', 4, 2, true, true)
ON CONFLICT (step_key, applies_to_type) DO NOTHING;

-- Seed: PERICIA reusa as mesmas etapas (pode ser customizado pela Jessica depois)
INSERT INTO public.os_step_templates
  (step_key, name, description, applies_to_type, order_index, requires_photos_min, requires_notes, requires_signature)
VALUES
  ('FOTO_INICIAL', 'Foto Inicial', 'Registre o estado encontrado.', 'PERICIA', 1, 2, true, false),
  ('VISTORIA', 'Vistoria Técnica', 'Preencha os 7 itens do checklist de perícia (temperatura, condições, patologias).', 'PERICIA', 2, 3, true, false),
  ('EVIDENCIAS', 'Evidências', 'Fotos das patologias e medições.', 'PERICIA', 3, 3, true, false),
  ('FINALIZACAO', 'Finalização', 'Encerramento da perícia.', 'PERICIA', 4, 1, true, false)
ON CONFLICT (step_key, applies_to_type) DO NOTHING;

-- Seed: GENERIC fallback
INSERT INTO public.os_step_templates
  (step_key, name, description, applies_to_type, order_index, requires_photos_min, requires_notes, requires_signature)
VALUES
  ('FOTO_INICIAL', 'Foto Inicial', 'Registre o estado inicial.', 'GENERIC', 1, 1, false, false),
  ('EXECUCAO', 'Execução', 'Realize o serviço e documente.', 'GENERIC', 2, 1, true, false),
  ('FINALIZACAO', 'Finalização', 'Conclua e colete assinatura.', 'GENERIC', 3, 1, false, true)
ON CONFLICT (step_key, applies_to_type) DO NOTHING;

-- ============================================
-- Trigger: created_at/updated_at
-- ============================================
CREATE TRIGGER set_updated_at_step_templates
  BEFORE UPDATE ON public.os_step_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_step_executions
  BEFORE UPDATE ON public.os_step_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.os_step_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_step_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view step templates"
  ON public.os_step_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage step templates"
  ON public.os_step_templates FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can manage all step executions"
  ON public.os_step_executions FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Technicians can view executions of their OS"
  ON public.os_step_executions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.technician_id = auth.uid()
    )
  );

CREATE POLICY "Technicians can update executions of their OS"
  ON public.os_step_executions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.technician_id = auth.uid()
    )
  );

CREATE POLICY "Technicians can insert executions for their OS"
  ON public.os_step_executions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.technician_id = auth.uid()
    )
  );
