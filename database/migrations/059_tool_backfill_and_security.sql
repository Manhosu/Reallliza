-- ============================================
-- Migration 059: Backfill do almoxarifado + RLS + realtime
-- ============================================
-- Complementa a 058. Tres frentes:
--   1) Migra os dados existentes pro modelo novo, sem apagar nada
--   2) Liga RLS nas tabelas que estavam sem (tool_maintenance/tool_retirements)
--      e cria policies nas tabelas novas
--   3) Publica tool_requests/tool_custody no realtime, sem o que a regra
--      "toda movimentacao deve refletir automaticamente no app" (secao 31)
--      nao tem como funcionar

BEGIN;

-- ============================================
-- 1) Modo de controle dos tipos existentes
-- ============================================
-- Um tipo vira 'controlled' quando ja demonstra caracteristica de item
-- individual: tem patrimonio, ou e' peca unica. O resto (espacador 1000,
-- lapis 100, trenas 10...) fica no controle por quantidade.
UPDATE public.tool_inventory
SET tracking_mode = 'controlled'
WHERE tracking_mode = 'quantity'
  AND (patrimony_code IS NOT NULL OR quantity_available <= 1);

-- ============================================
-- 2) Gera a unidade fisica dos tipos controlados
-- ============================================
-- Uma unidade por tipo, herdando os dados que ja existiam. O almoxarifado
-- cadastra as demais unidades pela tela. NAO expandimos quantity_available em
-- N unidades de proposito: a soma hoje e 1161 e geraria registros sem uso.
INSERT INTO public.tool_units (
  tool_id, code, patrimony_code, serial_number, status, condition,
  location, photos, notes, acquired_at
)
SELECT
  t.id,
  COALESCE(NULLIF(t.patrimony_code, ''), NULLIF(t.serial_number, ''),
           'UN-' || substr(t.id::text, 1, 8)),
  NULLIF(t.patrimony_code, ''),
  NULLIF(t.serial_number, ''),
  t.status,
  t.condition,
  t.default_location,
  t.photos,
  t.notes,
  t.purchase_date
FROM public.tool_inventory t
WHERE t.tracking_mode = 'controlled'
  AND NOT EXISTS (SELECT 1 FROM public.tool_units u WHERE u.tool_id = t.id);

-- Liga as movimentacoes existentes a essa unidade, quando o tipo e controlado
UPDATE public.tool_custody c
SET unit_id = u.id
FROM public.tool_units u
WHERE u.tool_id = c.tool_id AND c.unit_id IS NULL;

UPDATE public.tool_maintenance m
SET unit_id = u.id
FROM public.tool_units u
WHERE u.tool_id = m.tool_id AND m.unit_id IS NULL;

UPDATE public.tool_retirements r
SET unit_id = u.id
FROM public.tool_units u
WHERE u.tool_id = r.tool_id AND r.unit_id IS NULL;

-- ============================================
-- 3) Semeia o historico a partir do que ja aconteceu
-- ============================================
-- Cadastro de cada tipo
INSERT INTO public.tool_events (tool_id, unit_id, event_type, description, status_to, created_at)
SELECT t.id, u.id, 'cadastro',
       'Ferramenta cadastrada: ' || t.name,
       t.status::text, t.created_at
FROM public.tool_inventory t
LEFT JOIN public.tool_units u ON u.tool_id = t.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.tool_events e WHERE e.tool_id = t.id AND e.event_type = 'cadastro'
);

-- Entregas
INSERT INTO public.tool_events (
  tool_id, unit_id, custody_id, event_type, description,
  status_to, technician_id, almoxarife_id, service_order_id,
  condition, notes, photos, created_at
)
SELECT c.tool_id, c.unit_id, c.id, 'entrega',
       'Entrega registrada ao tecnico',
       'in_custody', c.user_id, c.delivered_by, c.service_order_id,
       c.condition_out, c.notes_out, c.photos_out, c.checked_out_at
FROM public.tool_custody c
WHERE NOT EXISTS (
  SELECT 1 FROM public.tool_events e WHERE e.custody_id = c.id AND e.event_type = 'entrega'
);

-- Devolucoes ja concluidas
INSERT INTO public.tool_events (
  tool_id, unit_id, custody_id, event_type, description,
  status_to, technician_id, almoxarife_id, service_order_id,
  condition, notes, photos, created_at
)
SELECT c.tool_id, c.unit_id, c.id, 'recebimento',
       'Devolucao recebida pelo almoxarifado',
       'available', c.user_id, c.received_by, c.service_order_id,
       c.condition_in, c.notes_in, c.photos_in, c.checked_in_at
FROM public.tool_custody c
WHERE c.checked_in_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tool_events e WHERE e.custody_id = c.id AND e.event_type = 'recebimento'
  );

-- ============================================
-- 4) RLS
-- ============================================
ALTER TABLE public.tool_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_extension_requests ENABLE ROW LEVEL SECURITY;
-- Estas duas estavam sem RLS desde a 053
ALTER TABLE public.tool_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_retirements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view tool units" ON public.tool_units
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage tool units" ON public.tool_units
    FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Historico: leitura pra todo autenticado, escrita so' inserindo.
-- Sem policy de UPDATE nem DELETE — correcao vira evento novo (secao 25).
DO $$ BEGIN
  CREATE POLICY "Anyone can view tool events" ON public.tool_events
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated insert tool events" ON public.tool_events
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage maintenance" ON public.tool_maintenance
    FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can view maintenance" ON public.tool_maintenance
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage retirements" ON public.tool_retirements
    FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can view retirements" ON public.tool_retirements
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Prorrogacao: o tecnico ve e cria a sua; admin decide
DO $$ BEGIN
  CREATE POLICY "Admins manage extensions" ON public.tool_extension_requests
    FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Technicians view own extensions" ON public.tool_extension_requests
    FOR SELECT USING (requested_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Technicians create own extensions" ON public.tool_extension_requests
    FOR INSERT WITH CHECK (requested_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- ============================================
-- 5) Realtime
-- ============================================
-- Fora da transacao: ALTER PUBLICATION nao roda junto com DDL de tabela.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tool_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tool_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tool_custody'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tool_custody;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tool_units'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tool_units;
  END IF;
END $$;
