-- Reteste pago de quiz (Jéssica, 17/09): quando o aluno esgota as
-- tentativas de uma aula de quiz sem ser aprovado, o sistema oferece um
-- reteste pago — configurável por aula, porque o valor pode variar entre
-- provas. Mesma forma de course_purchases (uma linha por tentativa de
-- compra), só que por AULA em vez de por CURSO, porque é isso que se
-- desbloqueia: uma nova tentativa numa aula específica, não acesso ao
-- curso inteiro (esse já existe).

ALTER TABLE public.course_lessons
  ADD COLUMN IF NOT EXISTS retest_price_cents INTEGER;

CREATE TABLE IF NOT EXISTS public.quiz_retest_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  -- pending: aguardando pagamento. paid: pago, tentativa extra disponível.
  -- consumed: a tentativa extra já foi usada. cancelled: nunca foi paga.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'consumed', 'cancelled')),
  asaas_id TEXT,
  checkout_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_retest_purchases_lesson_user ON public.quiz_retest_purchases(lesson_id, user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_retest_purchases_status ON public.quiz_retest_purchases(status);

ALTER TABLE public.quiz_retest_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_retest_purchases_own_or_admin ON public.quiz_retest_purchases;
CREATE POLICY quiz_retest_purchases_own_or_admin ON public.quiz_retest_purchases
  FOR SELECT USING (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
