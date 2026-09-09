-- Módulo de Cursos completo (padrão Hotmart/Kiwify), fechado separadamente
-- com o Ricardo: curso pago com nível/carga horária, acesso por compra,
-- liberação manual ou por equipe, quiz de verdade com nota mínima e
-- tentativas, e histórico de tentativas pra analytics.

-- Fase A: metadados de curso pago + controle de acesso.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS level TEXT CHECK (level IN ('iniciante', 'intermediario', 'avancado')),
  ADD COLUMN IF NOT EXISTS workload_hours NUMERIC;

ALTER TYPE public.enrollment_status ADD VALUE IF NOT EXISTS 'failed';

CREATE TABLE IF NOT EXISTS public.course_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  asaas_id TEXT,
  checkout_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_purchases_course_user ON public.course_purchases(course_id, user_id);
CREATE INDEX IF NOT EXISTS idx_course_purchases_status ON public.course_purchases(status);

-- Liberação manual por usuário — mesmo formato de feed_sponsor_users /
-- profile_certifications (granted_by pra auditoria de quem liberou).
CREATE TABLE IF NOT EXISTS public.course_access_grants (
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);

-- Liberação por equipe inteira — reaproveita `teams`, já usado no agendamento.
CREATE TABLE IF NOT EXISTS public.course_team_access (
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, team_id)
);

-- Fase C: quiz de verdade (quiz_questions já existe em course_lessons,
-- só nunca foi usado de fato).
ALTER TABLE public.course_lessons
  ADD COLUMN IF NOT EXISTS min_passing_score INTEGER,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER;

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,
  score INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  attempt_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_lesson_user ON public.quiz_attempts(lesson_id, user_id);

-- RLS — mesmo padrão de course_categories/course_enrollments: dono ou
-- admin lê, só admin escreve liberação/equipe (as rotas de API usam o
-- client de service-role, isto é o backstop).
ALTER TABLE public.course_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_purchases_own_or_admin ON public.course_purchases;
CREATE POLICY course_purchases_own_or_admin ON public.course_purchases
  FOR SELECT USING (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE public.course_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_access_grants_read ON public.course_access_grants;
CREATE POLICY course_access_grants_read ON public.course_access_grants
  FOR SELECT USING (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS course_access_grants_admin_write ON public.course_access_grants;
CREATE POLICY course_access_grants_admin_write ON public.course_access_grants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE public.course_team_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_team_access_select_all ON public.course_team_access;
CREATE POLICY course_team_access_select_all ON public.course_team_access
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS course_team_access_admin_write ON public.course_team_access;
CREATE POLICY course_team_access_admin_write ON public.course_team_access
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_attempts_own_or_admin ON public.quiz_attempts;
CREATE POLICY quiz_attempts_own_or_admin ON public.quiz_attempts
  FOR ALL USING (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
