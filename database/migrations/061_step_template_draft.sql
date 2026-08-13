-- ============================================
-- Migration 061: Rascunho de template de execução
-- ============================================
-- Jessica 13/08: "quando clico para criar o template, fica carregando, não
-- salva e acaba perdendo todas as informações que eu já preenchi. Precisamos
-- colocar uma opção de Salvar como rascunho."
--
-- `is_active` já significa outra coisa (template desativado, que some do
-- seletor da OS mas continua no histórico). Reaproveitá-lo para rascunho
-- misturaria "guardei pela metade" com "aposentei este template". Coluna
-- própria.

ALTER TABLE public.step_template_groups
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.step_template_groups.is_draft IS
  'Rascunho: em edição, não aparece no seletor de template da OS. Vira false ao publicar.';

-- O seletor de template da OS e a instanciação de etapas leem por is_active;
-- o índice parcial evita varrer os rascunhos nessas leituras.
CREATE INDEX IF NOT EXISTS idx_step_groups_publicados
  ON public.step_template_groups(created_at DESC)
  WHERE is_active = true AND is_draft = false;

-- Rascunho pode nascer sem nenhuma etapa (ela salva no meio do preenchimento),
-- então não há constraint de mínimo de itens aqui — a exigência de pelo menos
-- uma etapa vale só na publicação, validada na rota.

-- Uma OS nunca deve apontar para um rascunho. Nenhuma aponta hoje (a coluna
-- nasceu agora com default false), mas a trava evita que uma regressão futura
-- instancie etapas de um template pela metade.
CREATE OR REPLACE FUNCTION public.impedir_os_com_template_rascunho()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.step_template_group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.step_template_groups g
    WHERE g.id = NEW.step_template_group_id AND g.is_draft = true
  ) THEN
    RAISE EXCEPTION 'Template % ainda é rascunho e não pode ser usado numa OS',
      NEW.step_template_group_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_os_template_nao_rascunho ON public.service_orders;
CREATE TRIGGER trg_os_template_nao_rascunho
  BEFORE INSERT OR UPDATE OF step_template_group_id ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_os_com_template_rascunho();
