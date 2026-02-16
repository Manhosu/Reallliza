-- ============================================
-- REALLLIZA REVESTIMENTOS - DATABASE SCHEMA
-- Execute este SQL no Supabase Dashboard > SQL Editor
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'technician', 'partner');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE os_status AS ENUM (
  'open',
  'under_review',
  'approved',
  'scheduled',
  'in_transit',
  'in_progress',
  'checklist_pending',
  'completed',
  'invoiced',
  'cancelled',
  'paused'
);
CREATE TYPE os_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE photo_type AS ENUM ('before', 'during', 'after');
CREATE TYPE tool_status AS ENUM ('available', 'in_custody', 'maintenance', 'retired');
CREATE TYPE tool_condition AS ENUM ('new', 'good', 'fair', 'poor', 'damaged');
CREATE TYPE notification_type AS ENUM ('os_assigned', 'os_status_changed', 'new_ticket', 'tool_overdue', 'schedule_reminder', 'general');
CREATE TYPE schedule_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled');

-- ============================================
-- PROFILES TABLE (extends Supabase auth.users)
-- ============================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'technician',
  status user_status NOT NULL DEFAULT 'active',
  cpf TEXT,
  rg TEXT,
  address JSONB,
  specialties TEXT[],
  documents_urls TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PARTNERS TABLE
-- ============================================

CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  cnpj TEXT,
  trading_name TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address JSONB,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_partner_user UNIQUE (user_id),
  CONSTRAINT unique_partner_cnpj UNIQUE (cnpj)
);

-- ============================================
-- SERVICE ORDERS TABLE
-- ============================================

CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number SERIAL,
  title TEXT NOT NULL,
  description TEXT,
  status os_status NOT NULL DEFAULT 'open',
  priority os_priority NOT NULL DEFAULT 'medium',

  -- Client info
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  client_document TEXT,

  -- Address
  address_street TEXT,
  address_number TEXT,
  address_complement TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  geo_lat DOUBLE PRECISION,
  geo_lng DOUBLE PRECISION,

  -- Relations
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  technician_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),

  -- Dates
  scheduled_date DATE,
  scheduled_start_time TIME,
  scheduled_end_time TIME,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Financial
  estimated_value DECIMAL(12,2),
  final_value DECIMAL(12,2),

  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CHECKLIST TEMPLATES TABLE
-- ============================================

CREATE TABLE public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CHECKLISTS TABLE
-- ============================================

CREATE TABLE public.checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.checklist_templates(id),
  technician_id UUID NOT NULL REFERENCES public.profiles(id),
  data JSONB NOT NULL DEFAULT '{}',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- PHOTOS TABLE
-- ============================================

CREATE TABLE public.photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  checklist_id UUID REFERENCES public.checklists(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  type photo_type NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  original_filename TEXT,
  file_size INTEGER,
  geo_lat DOUBLE PRECISION,
  geo_lng DOUBLE PRECISION,
  watermark_data JSONB,
  caption TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TOOL INVENTORY TABLE
-- ============================================

CREATE TABLE public.tool_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  serial_number TEXT,
  category TEXT,
  status tool_status NOT NULL DEFAULT 'available',
  condition tool_condition NOT NULL DEFAULT 'good',
  photo_url TEXT,
  purchase_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TOOL CUSTODY TABLE
-- ============================================

CREATE TABLE public.tool_custody (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id UUID NOT NULL REFERENCES public.tool_inventory(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  checked_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  condition_out tool_condition NOT NULL,
  condition_in tool_condition,
  notes_out TEXT,
  notes_in TEXT,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'general',
  data JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- OS STATUS HISTORY TABLE
-- ============================================

CREATE TABLE public.os_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  from_status os_status,
  to_status os_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- SCHEDULES TABLE
-- ============================================

CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES public.profiles(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  status schedule_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_profiles_email ON public.profiles(email);

CREATE INDEX idx_partners_user_id ON public.partners(user_id);
CREATE INDEX idx_partners_cnpj ON public.partners(cnpj);

CREATE INDEX idx_service_orders_status ON public.service_orders(status);
CREATE INDEX idx_service_orders_priority ON public.service_orders(priority);
CREATE INDEX idx_service_orders_partner ON public.service_orders(partner_id);
CREATE INDEX idx_service_orders_technician ON public.service_orders(technician_id);
CREATE INDEX idx_service_orders_created_by ON public.service_orders(created_by);
CREATE INDEX idx_service_orders_scheduled_date ON public.service_orders(scheduled_date);
CREATE INDEX idx_service_orders_created_at ON public.service_orders(created_at);

CREATE INDEX idx_checklists_service_order ON public.checklists(service_order_id);
CREATE INDEX idx_checklists_technician ON public.checklists(technician_id);

CREATE INDEX idx_photos_service_order ON public.photos(service_order_id);
CREATE INDEX idx_photos_type ON public.photos(type);

CREATE INDEX idx_tool_inventory_status ON public.tool_inventory(status);
CREATE INDEX idx_tool_custody_tool ON public.tool_custody(tool_id);
CREATE INDEX idx_tool_custody_user ON public.tool_custody(user_id);
CREATE INDEX idx_tool_custody_checked_in ON public.tool_custody(checked_in_at);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read_at);
CREATE INDEX idx_notifications_created ON public.notifications(created_at);

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);

CREATE INDEX idx_os_status_history_os ON public.os_status_history(service_order_id);

CREATE INDEX idx_schedules_technician ON public.schedules(technician_id);
CREATE INDEX idx_schedules_date ON public.schedules(date);
CREATE INDEX idx_schedules_os ON public.schedules(service_order_id);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.checklists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tool_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'technician')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- PARTNERS policies
CREATE POLICY "Admins can manage partners" ON public.partners FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Partners can view own data" ON public.partners FOR SELECT USING (user_id = auth.uid());

-- SERVICE ORDERS policies
CREATE POLICY "Admins can manage all OS" ON public.service_orders FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Technicians can view assigned OS" ON public.service_orders FOR SELECT USING (technician_id = auth.uid());
CREATE POLICY "Technicians can update assigned OS" ON public.service_orders FOR UPDATE USING (technician_id = auth.uid());
CREATE POLICY "Partners can view own OS" ON public.service_orders FOR SELECT USING (
  partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
);
CREATE POLICY "Partners can create OS" ON public.service_orders FOR INSERT WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'partner')
);

-- CHECKLISTS policies
CREATE POLICY "Admins can manage checklists" ON public.checklists FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Technicians can manage own checklists" ON public.checklists FOR ALL USING (technician_id = auth.uid());

-- CHECKLIST TEMPLATES policies
CREATE POLICY "Anyone can view active templates" ON public.checklist_templates FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage templates" ON public.checklist_templates FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- PHOTOS policies
CREATE POLICY "Admins can manage photos" ON public.photos FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Users can view photos of accessible OS" ON public.photos FOR SELECT USING (
  service_order_id IN (
    SELECT id FROM public.service_orders
    WHERE technician_id = auth.uid()
    OR created_by = auth.uid()
    OR partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  )
);
CREATE POLICY "Technicians can upload photos" ON public.photos FOR INSERT WITH CHECK (uploaded_by = auth.uid());

-- TOOL INVENTORY policies
CREATE POLICY "Anyone can view tools" ON public.tool_inventory FOR SELECT USING (true);
CREATE POLICY "Admins can manage tools" ON public.tool_inventory FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- TOOL CUSTODY policies
CREATE POLICY "Admins can manage custody" ON public.tool_custody FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Users can view own custody" ON public.tool_custody FOR SELECT USING (user_id = auth.uid());

-- NOTIFICATIONS policies
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- AUDIT LOGS policies
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "System can create audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- OS STATUS HISTORY policies
CREATE POLICY "Admins can view all history" ON public.os_status_history FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Users can view history of accessible OS" ON public.os_status_history FOR SELECT USING (
  service_order_id IN (
    SELECT id FROM public.service_orders
    WHERE technician_id = auth.uid()
    OR created_by = auth.uid()
    OR partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  )
);

-- SCHEDULES policies
CREATE POLICY "Admins can manage schedules" ON public.schedules FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Technicians can view own schedule" ON public.schedules FOR SELECT USING (technician_id = auth.uid());

-- ============================================
-- STORAGE BUCKETS
-- ============================================
-- Run these in the Supabase Dashboard > Storage:
-- 1. Create bucket "photos" (public: false)
-- 2. Create bucket "documents" (public: false)
-- 3. Create bucket "avatars" (public: true)
