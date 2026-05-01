-- ============================================
-- Migration 011: Chat Operacional na OS
-- ============================================
-- Manual da Jessica seção 15: "Chat Operacional - Dentro da OS:
-- Técnico fala com a empresa. Tudo fica registrado."

CREATE TABLE IF NOT EXISTS public.os_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL, -- 'admin' | 'operator' | 'technician' | 'system' | 'partner'
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_type TEXT, -- 'image' | 'audio' | 'video' | 'document'
  read_at TIMESTAMPTZ,
  external_message_id TEXT, -- referência cross-system (Garantias ticket_messages.id)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_os_messages_order_created
  ON public.os_messages(service_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_messages_unread
  ON public.os_messages(service_order_id)
  WHERE read_at IS NULL;

-- RLS
ALTER TABLE public.os_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all messages"
  ON public.os_messages FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Technicians can view messages of their OS"
  ON public.os_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.technician_id = auth.uid()
    )
  );

CREATE POLICY "Technicians can send messages on their OS"
  ON public.os_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.technician_id = auth.uid()
    )
    AND sender_user_id = auth.uid()
  );

CREATE POLICY "Partners can view messages of their OS"
  ON public.os_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      JOIN public.partners p ON p.id = so.partner_id
      WHERE so.id = service_order_id AND p.user_id = auth.uid()
    )
  );
