-- Marco 4/5: hierarquia de categoria acima do curso, faltava pra fechar
-- o item "Cursos / Biblioteca Técnica" (categoria -> curso -> módulo).
-- Mesmo padrão de service_categories/services (021_service_catalog.sql).

CREATE TABLE IF NOT EXISTS public.course_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.course_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_courses_category_id ON public.courses(category_id);

ALTER TABLE public.course_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_categories_select_all ON public.course_categories;
CREATE POLICY course_categories_select_all ON public.course_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS course_categories_admin_write ON public.course_categories;
CREATE POLICY course_categories_admin_write ON public.course_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
