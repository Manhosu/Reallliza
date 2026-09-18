-- Disponibilidade de Trabalho do homologado (Jéssica, 18/09).
--
-- Hoje a seleção de homologados pra uma proposta só olha a agenda (tem OS
-- marcada naquele dia?) e a região (operating_region bate com a UF?). Uma
-- agenda vazia não significa disponível — o profissional pode não
-- trabalhar domingo, feriado, à noite, ou fora do próprio estado. Essas
-- regras hoje não existem em lugar nenhum: são cinco toggles novos,
-- editáveis a qualquer momento pelo próprio homologado, sem afetar OS já
-- aceitas (a mudança só vale pra próximas seleções).
--
-- Default TRUE em tudo: sem isso, todo homologado que nunca configurou
-- nada ficaria excluído de sábado/domingo/feriado/noturno/interestadual
-- no instante em que a tabela existisse — uma regressão silenciosa do dia
-- pro outro. Só passa a restringir quando o próprio homologado desativa
-- alguma opção.
CREATE TABLE IF NOT EXISTS public.technician_availability_settings (
  technician_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  works_saturday    BOOLEAN NOT NULL DEFAULT true,
  works_sunday      BOOLEAN NOT NULL DEFAULT true,
  works_holidays    BOOLEAN NOT NULL DEFAULT true,
  works_after_hours BOOLEAN NOT NULL DEFAULT true,
  works_interstate  BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_technician_availability_updated_at ON public.technician_availability_settings;
CREATE TRIGGER set_technician_availability_updated_at
  BEFORE UPDATE ON public.technician_availability_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.technician_availability_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technician_availability_own_or_admin_select ON public.technician_availability_settings;
CREATE POLICY technician_availability_own_or_admin_select ON public.technician_availability_settings
  FOR SELECT USING (
    technician_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS technician_availability_own_write ON public.technician_availability_settings;
CREATE POLICY technician_availability_own_write ON public.technician_availability_settings
  FOR ALL USING (
    technician_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    technician_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Janela de execução prevista da OS (data/hora/dias de duração), copiada da
-- quote no momento da conversão pra OS — antes disso, essa informação só
-- existia em `quotes`, sem FK de volta a partir de `service_orders`, então
-- nada além do fluxo que criou a quote conseguia saber "quando" a OS
-- precisa acontecer. Alimenta o cruzamento de disponibilidade abaixo, pra
-- fanout/broadcast/aceite de proposta olharem sem precisar voltar na quote.
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS requested_date DATE,
  ADD COLUMN IF NOT EXISTS requested_time TIME,
  ADD COLUMN IF NOT EXISTS requested_days INT;
