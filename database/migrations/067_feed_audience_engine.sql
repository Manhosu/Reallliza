-- ============================================
-- Migration 067: Execução das regras de audiência
-- ============================================
-- O predicado chega compilado de lib/feed/audience.ts, com os valores fora do
-- texto — eles viajam no JSONB `p_params` e o predicado só referencia
-- posições dele. Isso é o que torna a regra imune a injeção sem depender de
-- escapar string corretamente.

-- Visão achatada do perfil: um lugar só para adicionar campo novo de
-- segmentação. A regra nunca toca `profiles` diretamente.
CREATE OR REPLACE VIEW public.feed_audience_profile_v AS
SELECT
  p.id                                   AS user_id,
  p.role::TEXT                           AS role,
  p.status::TEXT                         AS status,
  p.uf,
  p.city_ibge_code,
  p.professional_type,
  p.is_homologated,
  p.level,
  p.overall_score,
  EXTRACT(DAY FROM NOW() - p.created_at)::INT AS days_since_signup,
  COALESCE(sp.specialty_ids, '{}'::UUID[])    AS specialty_ids,
  COALESCE(ce.course_ids,    '{}'::UUID[])    AS completed_course_ids,
  COALESCE(tm.team_ids,      '{}'::UUID[])    AS team_ids,
  COALESCE(pa.partner_ids,   '{}'::UUID[])    AS partner_ids
FROM public.profiles p
LEFT JOIN LATERAL (
  -- profiles.specialties é TEXT[] de NOMES; a segmentação usa id. Casar por
  -- nome é frágil com acento, então a conversão fica aqui, num lugar só.
  SELECT array_agg(s.id) AS specialty_ids
    FROM public.specialties s
   WHERE p.specialties IS NOT NULL AND s.name = ANY(p.specialties)
) sp ON true
LEFT JOIN LATERAL (
  SELECT array_agg(e.course_id) AS course_ids
    FROM public.course_enrollments e
   WHERE e.user_id = p.id AND e.status = 'completed'
) ce ON true
LEFT JOIN LATERAL (
  SELECT array_agg(m.team_id) AS team_ids
    FROM public.team_members m
   WHERE m.technician_id = p.id
) tm ON true
LEFT JOIN LATERAL (
  SELECT array_agg(pt.id) AS partner_ids
    FROM public.partners pt
   WHERE pt.user_id = p.id
) pa ON true
WHERE p.status = 'active';

-- Materializa a audiência. Substitui o conjunto inteiro numa transação, para
-- não existir instante em que a regra está pela metade.
CREATE OR REPLACE FUNCTION public.feed_resolver_audiencia(
  p_rule_id UUID, p_predicado TEXT, p_params JSONB
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total INT;
BEGIN
  DELETE FROM public.feed_audience_members WHERE rule_id = p_rule_id;

  EXECUTE format(
    'INSERT INTO public.feed_audience_members (rule_id, user_id)
     SELECT %L::uuid, p.user_id FROM public.feed_audience_profile_v p WHERE %s',
    p_rule_id, p_predicado
  ) USING p_params;

  GET DIAGNOSTICS v_total = ROW_COUNT;

  UPDATE public.feed_audience_rules
     SET estimated_size = v_total, computed_at = NOW()
   WHERE id = p_rule_id;

  RETURN v_total;
END $$;

-- Só conta, sem materializar — o "estimar alcance" do editor.
CREATE OR REPLACE FUNCTION public.feed_estimar_audiencia(
  p_predicado TEXT, p_params JSONB
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total INT;
BEGIN
  EXECUTE format(
    'SELECT count(*) FROM public.feed_audience_profile_v p WHERE %s', p_predicado
  ) USING p_params INTO v_total;
  RETURN COALESCE(v_total, 0);
END $$;

-- Resolve todas as regras dinâmicas em uso — chamada pelo cron noturno.
CREATE OR REPLACE FUNCTION public.feed_recalcular_audiencias()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_regra RECORD; v_qtd INT := 0;
BEGIN
  FOR v_regra IN
    SELECT DISTINCT r.id
      FROM public.feed_audience_rules r
      JOIN public.feed_posts p ON p.audience_rule_id = r.id
     WHERE r.is_dynamic AND p.status IN ('published','scheduled')
  LOOP
    -- O predicado precisa ser recompilado pela aplicação; aqui só marcamos
    -- para a rota de cron reprocessar. Guardar SQL no banco seria pior.
    UPDATE public.feed_audience_rules SET computed_at = NULL WHERE id = v_regra.id;
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END $$;

-- Publica os agendados cuja hora chegou. Chamada pelo cron.
CREATE OR REPLACE FUNCTION public.feed_publicar_agendados()
RETURNS TABLE(post_id UUID, notificar BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.feed_posts p
     SET status = 'published', published_at = COALESCE(p.publish_at, NOW())
   WHERE p.status = 'scheduled'
     AND p.publish_at IS NOT NULL
     AND p.publish_at <= NOW()
  RETURNING p.id, p.notify_on_publish;
END $$;

-- Encerra os que passaram da data de fim.
CREATE OR REPLACE FUNCTION public.feed_encerrar_vencidos()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qtd INT;
BEGIN
  UPDATE public.feed_posts
     SET status = 'archived', archived_at = NOW()
   WHERE status = 'published'
     AND unpublish_at IS NOT NULL
     AND unpublish_at <= NOW();
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  -- Fixação vencida: recalcula a ordenação para o post sair do topo.
  UPDATE public.feed_posts
     SET updated_at = NOW()
   WHERE pinned_until IS NOT NULL
     AND pinned_until <= NOW()
     AND is_pinned = true;

  RETURN v_qtd;
END $$;
