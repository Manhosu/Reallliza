-- ============================================
-- Migration 052: Cursos obrigatorios por categoria
-- ============================================
-- Aditivo Marco 4: "OS X so pode ser recebida por tecnicos que concluíram
-- o Curso Y". Vinculo em service_categories (mesmo padrao dos outros
-- templates do 050/051).

BEGIN;

ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS required_course_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.service_categories.required_course_ids IS
  'IDs de cursos obrigatorios pra receber OS dessa categoria. Guard no assign valida via course_enrollments completed.';

CREATE INDEX IF NOT EXISTS idx_service_categories_required_courses
  ON public.service_categories USING GIN (required_course_ids)
  WHERE array_length(required_course_ids, 1) > 0;

COMMIT;
