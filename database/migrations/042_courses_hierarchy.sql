-- ============================================
-- Migration 042: Cursos hierarquicos (Marco 4 Parte B)
-- ============================================
-- Spec novosajustes.md F5: trilhas de cursos -> modulos -> aulas, com
-- progresso por usuario + certificado. Reusa learning_content (existente)
-- como banco de "aulas" individuais.

BEGIN;

-- ============================================
-- courses (trilhas)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_audience') THEN
    CREATE TYPE course_audience AS ENUM ('all', 'technician', 'partner', 'admin');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  audience course_audience NOT NULL DEFAULT 'technician',
  order_index INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  -- Quando true, completar gera certificado em PDF
  emit_certificate BOOLEAN NOT NULL DEFAULT TRUE,
  -- Quanto e necessario assistir/concluir das aulas pra liberar certificado (0-100)
  required_completion_pct INT NOT NULL DEFAULT 100 CHECK (required_completion_pct BETWEEN 0 AND 100),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_courses
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_courses_published ON public.courses(is_published, order_index);
CREATE INDEX IF NOT EXISTS idx_courses_audience ON public.courses(audience);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read courses"
  ON public.courses FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = TRUE);
CREATE POLICY "Admin writes courses"
  ON public.courses FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- course_modules (modulos dentro do curso)
-- ============================================
CREATE TABLE IF NOT EXISTS public.course_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_course_modules
  BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_course_modules_course ON public.course_modules(course_id, order_index);

ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read course_modules"
  ON public.course_modules FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = TRUE);
CREATE POLICY "Admin writes course_modules"
  ON public.course_modules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- course_lessons (aulas: video, texto, quiz)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_type') THEN
    CREATE TYPE lesson_type AS ENUM ('video', 'text', 'quiz', 'pdf');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  lesson_type lesson_type NOT NULL DEFAULT 'video',
  -- Conteudo
  video_url TEXT,
  pdf_url TEXT,
  content_md TEXT,             -- texto markdown
  quiz_questions JSONB,        -- [{question, options:[], correct_index}]
  -- Pode reutilizar um learning_content existente:
  learning_content_id UUID REFERENCES public.learning_content(id) ON DELETE SET NULL,
  duration_sec INT,
  order_index INT NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_course_lessons
  BEFORE UPDATE ON public.course_lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON public.course_lessons(module_id, order_index);

ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read course_lessons"
  ON public.course_lessons FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_published = TRUE);
CREATE POLICY "Admin writes course_lessons"
  ON public.course_lessons FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- course_enrollments (matriculas)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_status') THEN
    CREATE TYPE enrollment_status AS ENUM ('in_progress', 'completed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status enrollment_status NOT NULL DEFAULT 'in_progress',
  progress_pct INT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  certificate_issued_at TIMESTAMPTZ,
  certificate_pdf_url TEXT,
  certificate_code TEXT,  -- codigo unico do certificado
  CONSTRAINT enrollments_user_course_uk UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON public.course_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.course_enrollments(status);

ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own enrollment"
  ON public.course_enrollments FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "User writes own enrollment"
  ON public.course_enrollments FOR ALL
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- lesson_progress (progresso por aula)
-- ============================================
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID NOT NULL REFERENCES public.course_enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  watched_seconds INT NOT NULL DEFAULT 0,
  quiz_score NUMERIC(5, 2),  -- 0-100 pra aulas tipo quiz
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_progress_user_lesson_uk UNIQUE (user_id, lesson_id)
);

CREATE TRIGGER set_updated_at_lesson_progress
  BEFORE UPDATE ON public.lesson_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_lesson_progress_enrollment ON public.lesson_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON public.lesson_progress(user_id);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own progress"
  ON public.lesson_progress FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "User writes own progress"
  ON public.lesson_progress FOR ALL
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================
-- Bucket de Storage pra thumbnails + PDFs + certificados
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'courses',
  'courses',
  true,
  104857600,  -- 100MB (videos/pdfs)
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
    'application/pdf'
  ]
) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Auth read courses bucket'
  ) THEN
    CREATE POLICY "Auth read courses bucket"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'courses' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND policyname = 'Admin upload courses bucket'
  ) THEN
    CREATE POLICY "Admin upload courses bucket"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'courses' AND
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
  END IF;
END $$;

COMMIT;
