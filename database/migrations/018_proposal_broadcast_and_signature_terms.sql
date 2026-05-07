-- ============================================
-- Migration 018: Broadcast de propostas + termo de conclusão
-- ============================================
-- Permite que admin envie proposta "aberta" para todos os técnicos/parceiros
-- de uma região. Primeiro a aceitar fica com a OS; demais expiram.

-- 1) service_proposals: partner_id passa a ser opcional (broadcast)
ALTER TABLE service_proposals ALTER COLUMN partner_id DROP NOT NULL;

-- 2) Filtro regional opcional (UF de 2 letras). NULL = sem filtro regional.
ALTER TABLE service_proposals
  ADD COLUMN IF NOT EXISTS target_state TEXT
    CHECK (target_state IS NULL OR length(target_state) = 2);

-- 3) Quem aceitou (preenchido ao responder com action=accept; pode ser
--    profile.id de technician/partner, não apenas partner_id legado)
ALTER TABLE service_proposals
  ADD COLUMN IF NOT EXISTS accepted_by UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_broadcast
  ON service_proposals(target_state, status)
  WHERE partner_id IS NULL;

-- 4) RLS: técnicos/parceiros lêem propostas direcionadas a eles ou broadcast
--    da sua região (operating_region casa parcialmente com target_state).
DROP POLICY IF EXISTS "Anyone can read targeted or matching broadcast proposals"
  ON service_proposals;

CREATE POLICY "Anyone can read targeted or matching broadcast proposals"
  ON service_proposals FOR SELECT
  USING (
    -- Admins veem tudo
    public.get_user_role(auth.uid()) = 'admin'
    -- Parceiro destinatário direto
    OR partner_id = auth.uid()
    -- Broadcast e o user é technician/partner ativo
    OR (
      partner_id IS NULL
      AND public.get_user_role(auth.uid()) IN ('technician', 'partner')
      AND (
        target_state IS NULL
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND (
              p.operating_region IS NULL
              OR p.operating_region ILIKE '%' || target_state || '%'
            )
        )
      )
    )
  );

-- 5) Termo de conclusão de serviço (mostrado antes da assinatura mobile).
--    Preenchido por OS — se NULL, app usa texto padrão.
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS completion_terms TEXT;

-- 6) Marcadores: assinatura captada + texto do termo aceito (snapshot)
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS terms_accepted_text TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN service_orders.completion_terms IS
  'Termo de conclusão/entrega que o cliente lê antes de assinar. Editável por OS.';
COMMENT ON COLUMN service_orders.terms_accepted_text IS
  'Snapshot do termo no momento da assinatura (auditoria).';
