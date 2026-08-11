-- ============================================
-- Migration 058: Unidades fisicas + historico permanente (Jessica 06/08)
-- ============================================
-- Spec almoxarifado/ajustes.md, secoes 2, 10, 12, 17, 23-25 e 31:
--
--   "O tecnico solicita apenas o TIPO da ferramenta. O almoxarifado escolhe
--    qual UNIDADE FISICA sera entregue. Cada unidade fisica devera possuir
--    codigo proprio, patrimonio, situacao, localizacao e historico permanente."
--
-- Hoje tool_inventory mistura as duas coisas: tem quantity_available (= "tenho
-- N unidades") e ao mesmo tempo status/condition/serial_number, que sao
-- atributos de UMA unidade. Consequencia pratica: entregar 1 unidade marca a
-- linha inteira como in_custody e o tipo some do catalogo, mesmo com outras
-- unidades na prateleira.
--
-- MODO DE CONTROLE POR TIPO
-- O estoque real tem 1000 espacadores e 100 lapis. Rastrear cada um com codigo
-- e timeline seria inutilizavel, entao cada tipo declara como e' controlado:
--   'controlled' -> gera unidades fisicas individuais (parafusadeira, furadeira)
--   'quantity'   -> controla saldo, sem unidade individual (espacador, lapis)
-- O fluxo de pedido/entrega/devolucao e' o mesmo nos dois; muda so' se a
-- movimentacao rastreia uma unidade ou abate saldo.

BEGIN;

-- ============================================
-- 1) Modo de controle do TIPO
-- ============================================
ALTER TABLE public.tool_inventory
  ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'quantity';

DO $$ BEGIN
  ALTER TABLE public.tool_inventory
    ADD CONSTRAINT tool_inventory_tracking_mode_check
    CHECK (tracking_mode IN ('controlled', 'quantity'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.tool_inventory.tracking_mode IS
  'controlled = cada unidade fisica e rastreada em tool_units (codigo, patrimonio, historico). quantity = controle por saldo em quantity_available, sem unidade individual.';

-- ============================================
-- 2) tool_units — a unidade fisica
-- ============================================
CREATE TABLE IF NOT EXISTS public.tool_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id UUID NOT NULL REFERENCES public.tool_inventory(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  patrimony_code TEXT,
  serial_number TEXT,
  status tool_status NOT NULL DEFAULT 'available',
  condition tool_condition NOT NULL DEFAULT 'good',
  location TEXT,
  supplier TEXT,
  acquired_at DATE,
  acquisition_value NUMERIC(12, 2),
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  -- Reserva: unidade separada pra um pedido especifico. Secao 12 da spec:
  -- "a unidade nao podera ser utilizada em outro pedido".
  reserved_for_request_id UUID,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tool_units IS
  'Unidade fisica individual de um tipo controlado. Ex.: FUR-00123 do tipo "Furadeira de impacto".';
COMMENT ON COLUMN public.tool_units.code IS 'Codigo da unidade, unico no sistema (ex.: FUR-00123)';
COMMENT ON COLUMN public.tool_units.reserved_for_request_id IS
  'Pedido que reservou esta unidade. Enquanto preenchido, a unidade nao pode ser destinada a outro pedido.';

-- Secao 10: "O sistema devera impedir duplicidade de codigo, patrimonio e
-- numero de serie, quando informado."
CREATE UNIQUE INDEX IF NOT EXISTS uq_tool_units_code
  ON public.tool_units(lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS uq_tool_units_patrimony
  ON public.tool_units(lower(patrimony_code)) WHERE patrimony_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tool_units_serial
  ON public.tool_units(lower(serial_number)) WHERE serial_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tool_units_tool ON public.tool_units(tool_id, status);
CREATE INDEX IF NOT EXISTS idx_tool_units_status ON public.tool_units(status);
CREATE INDEX IF NOT EXISTS idx_tool_units_reserved
  ON public.tool_units(reserved_for_request_id) WHERE reserved_for_request_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_tool_units ON public.tool_units;
CREATE TRIGGER set_updated_at_tool_units BEFORE UPDATE ON public.tool_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3) tool_events — historico permanente, append-only
-- ============================================
-- Secao 25: "Nenhum evento podera ser apagado. Nenhum registro podera ser
-- sobrescrito. Se uma informacao for corrigida, o sistema devera criar um novo
-- evento." Por isso nao ha UPDATE nem DELETE aqui (ver policies na 059).
CREATE TABLE IF NOT EXISTS public.tool_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id UUID NOT NULL REFERENCES public.tool_inventory(id) ON DELETE RESTRICT,
  unit_id UUID REFERENCES public.tool_units(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  description TEXT,
  status_from TEXT,
  status_to TEXT,
  technician_id UUID REFERENCES public.profiles(id),
  almoxarife_id UUID REFERENCES public.profiles(id),
  actor_id UUID REFERENCES public.profiles(id),
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  custody_id UUID,
  request_id UUID,
  condition tool_condition,
  notes TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tool_events IS
  'Historico permanente da ferramenta/unidade. Append-only: correcao vira evento novo (spec secao 25).';
COMMENT ON COLUMN public.tool_events.event_type IS
  'cadastro | edicao | pedido_* | reserva | separacao | pronta_retirada | entrega | prorrogacao_* | devolucao_solicitada | recebimento | encerramento | dano | perda | extravio | manutencao_* | baixa_* | correcao';

CREATE INDEX IF NOT EXISTS idx_tool_events_unit ON public.tool_events(unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_events_tool ON public.tool_events(tool_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_events_technician ON public.tool_events(technician_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_events_type ON public.tool_events(event_type, created_at DESC);

-- ============================================
-- 4) Vinculo das movimentacoes com a unidade fisica
-- ============================================
ALTER TABLE public.tool_custody
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.tool_units(id) ON DELETE RESTRICT;
ALTER TABLE public.tool_requests
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.tool_units(id) ON DELETE SET NULL;
ALTER TABLE public.tool_maintenance
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.tool_units(id) ON DELETE RESTRICT;
ALTER TABLE public.tool_retirements
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.tool_units(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.tool_custody.unit_id IS
  'Unidade fisica entregue. NULL quando o tipo e controlado por quantidade.';
COMMENT ON COLUMN public.tool_requests.unit_id IS
  'Unidade destinada ao pedido, definida na aprovacao pelo almoxarifado (o tecnico pede so o tipo).';

CREATE INDEX IF NOT EXISTS idx_tool_custody_unit ON public.tool_custody(unit_id);
CREATE INDEX IF NOT EXISTS idx_tool_requests_unit ON public.tool_requests(unit_id);

-- FK da reserva, criada agora que tool_requests ja existe com a coluna
DO $$ BEGIN
  ALTER TABLE public.tool_units
    ADD CONSTRAINT tool_units_reserved_request_fkey
    FOREIGN KEY (reserved_for_request_id)
    REFERENCES public.tool_requests(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 5) Campos de prazo no pedido
-- ============================================
-- Sem eles, "vence hoje", "atrasada" e "proxima devolucao" — metade das telas
-- pedidas — nao tem de onde sair.
ALTER TABLE public.tool_requests
  ADD COLUMN IF NOT EXISTS needed_at DATE,
  ADD COLUMN IF NOT EXISTS expected_return_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS almoxarife_notes TEXT;

COMMENT ON COLUMN public.tool_requests.needed_at IS 'Data em que o tecnico precisa da ferramenta';
COMMENT ON COLUMN public.tool_requests.expected_return_at IS 'Devolucao prevista informada no pedido';
COMMENT ON COLUMN public.tool_requests.almoxarife_notes IS 'Observacao do almoxarifado, visivel pro tecnico no app';

-- ============================================
-- 6) Prorrogacoes (spec secao 17)
-- ============================================
CREATE TABLE IF NOT EXISTS public.tool_extension_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  custody_id UUID NOT NULL REFERENCES public.tool_custody(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  current_return_at TIMESTAMPTZ,
  requested_return_at TIMESTAMPTZ NOT NULL,
  approved_return_at TIMESTAMPTZ,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES public.profiles(id),
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE public.tool_extension_requests
    ADD CONSTRAINT tool_extension_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tool_extension_custody
  ON public.tool_extension_requests(custody_id, status);
CREATE INDEX IF NOT EXISTS idx_tool_extension_pending
  ON public.tool_extension_requests(status, created_at DESC) WHERE status = 'pending';

DROP TRIGGER IF EXISTS set_updated_at_tool_extension ON public.tool_extension_requests;
CREATE TRIGGER set_updated_at_tool_extension BEFORE UPDATE ON public.tool_extension_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7) Devolucao solicitada e dano comunicado pelo tecnico
-- ============================================
-- Secao 4: "Quando o tecnico solicitar devolucao, a ferramenta CONTINUA
-- aparecendo na Custodia. Ela so sai quando o almoxarifado confirmar o
-- recebimento fisico." Por isso e uma marca na custodia, nao um encerramento.
ALTER TABLE public.tool_custody
  ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS damage_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS damage_description TEXT;

CREATE INDEX IF NOT EXISTS idx_tool_custody_return_requested
  ON public.tool_custody(return_requested_at)
  WHERE return_requested_at IS NOT NULL AND checked_in_at IS NULL;

-- ============================================
-- 8) Historico deixa de ser apagavel junto com a ferramenta
-- ============================================
-- Secao 31: "Nenhum historico podera ser apagado." Hoje as FKs sao CASCADE e a
-- rota /tools/[id]/purge apaga a ferramenta levando custodias, manutencoes e
-- baixas junto.
ALTER TABLE public.tool_custody
  DROP CONSTRAINT IF EXISTS tool_custody_tool_id_fkey;
ALTER TABLE public.tool_custody
  ADD CONSTRAINT tool_custody_tool_id_fkey
  FOREIGN KEY (tool_id) REFERENCES public.tool_inventory(id) ON DELETE RESTRICT;

ALTER TABLE public.tool_maintenance
  DROP CONSTRAINT IF EXISTS tool_maintenance_tool_id_fkey;
ALTER TABLE public.tool_maintenance
  ADD CONSTRAINT tool_maintenance_tool_id_fkey
  FOREIGN KEY (tool_id) REFERENCES public.tool_inventory(id) ON DELETE RESTRICT;

ALTER TABLE public.tool_retirements
  DROP CONSTRAINT IF EXISTS tool_retirements_tool_id_fkey;
ALTER TABLE public.tool_retirements
  ADD CONSTRAINT tool_retirements_tool_id_fkey
  FOREIGN KEY (tool_id) REFERENCES public.tool_inventory(id) ON DELETE RESTRICT;

-- ============================================
-- 9) Status de manutencao (spec secao 21)
-- ============================================
ALTER TABLE public.tool_maintenance
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'awaiting_evaluation',
  ADD COLUMN IF NOT EXISTS diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS service_performed TEXT,
  ADD COLUMN IF NOT EXISTS parts_replaced TEXT,
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS test_result TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT;

DO $$ BEGIN
  ALTER TABLE public.tool_maintenance
    ADD CONSTRAINT tool_maintenance_status_check
    CHECK (status IN (
      'awaiting_evaluation', 'diagnosing', 'awaiting_approval', 'repairing',
      'awaiting_part', 'testing', 'completed', 'unrepairable', 'sent_to_retirement'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.tool_maintenance.origin IS 'De onde veio a ocorrencia: devolucao, dano comunicado, inspecao...';

-- ============================================
-- 10) Baixa com motivo padronizado (spec secao 22)
-- ============================================
ALTER TABLE public.tool_retirements
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS final_condition tool_condition,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revert_reason TEXT;

DO $$ BEGIN
  ALTER TABLE public.tool_retirements
    ADD CONSTRAINT tool_retirements_reason_code_check
    CHECK (reason_code IS NULL OR reason_code IN (
      'inutilizacao', 'obsolescencia', 'extravio', 'roubo', 'perda',
      'descarte', 'venda', 'sinistro', 'sem_reparo'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 11) Localizacao no tipo (herdada pelas unidades novas)
-- ============================================
ALTER TABLE public.tool_inventory
  ADD COLUMN IF NOT EXISTS default_location TEXT,
  ADD COLUMN IF NOT EXISTS supplier TEXT;

COMMIT;
