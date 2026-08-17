-- 073 — Os dois mapas do painel: quando as pessoas acessam e de onde
--
-- Nenhum dos dois precisa de coleta nova. O horário exato de cada evento
-- sempre foi gravado e a UF também — só nunca ninguém tinha perguntado ao
-- banco "que horas o pessoal abre o feed" nem "onde eles estão".
--
-- As duas funções agregam sobre `feed_events`, que é a tabela que só cresce.
-- Ficam como função e não como consulta na aplicação porque o mesmo número
-- vai ser pedido pelo painel geral, pelo relatório e, na Fase 4, pelo portal
-- do patrocinador — três lugares, uma conta.

-- ---------------------------------------------------------------
-- Horários e dias de maior movimento
-- ---------------------------------------------------------------
-- Em horário de Brasília, não em UTC. O gráfico existe para alguém decidir a
-- que horas publicar, e essa decisão é tomada no fuso de quem publica.
CREATE OR REPLACE FUNCTION public.feed_mapa_de_acesso(
  p_desde      TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_sponsor_id UUID DEFAULT NULL
)
RETURNS TABLE(dia_semana SMALLINT, hora SMALLINT, eventos BIGINT, pessoas INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXTRACT(DOW  FROM e.occurred_at AT TIME ZONE 'America/Sao_Paulo')::SMALLINT,
         EXTRACT(HOUR FROM e.occurred_at AT TIME ZONE 'America/Sao_Paulo')::SMALLINT,
         count(*),
         count(DISTINCT e.user_id)::INT
    FROM public.feed_events e
   WHERE e.occurred_at >= p_desde
     AND e.event_type IN ('impression','view')
     AND (p_sponsor_id IS NULL OR e.dim_sponsor_id = p_sponsor_id)
   GROUP BY 1, 2
   ORDER BY 1, 2;
$$;

COMMENT ON FUNCTION public.feed_mapa_de_acesso IS
  'Movimento por dia da semana e hora, em horario de Brasilia. 0 = domingo.';

-- ---------------------------------------------------------------
-- Mapa do Brasil
-- ---------------------------------------------------------------
-- Devolve as 27 UFs sempre, mesmo as sem nenhum profissional: um mapa que
-- some os estados vazios não é mapa, é lista. E o estado vazio é justamente
-- a informação que interessa a quem vai vender cobertura nacional.
CREATE OR REPLACE FUNCTION public.feed_mapa_do_brasil(
  p_desde      TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_sponsor_id UUID DEFAULT NULL
)
RETURNS TABLE(
  uf CHAR(2), nome TEXT, regiao TEXT,
  profissionais INT, alcancados INT, impressoes BIGINT, interacoes BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.uf, u.name, u.region,
         COALESCE(p.qtd, 0),
         COALESCE(e.pessoas, 0),
         COALESCE(e.impressoes, 0),
         COALESCE(e.interacoes, 0)
    FROM public.br_ufs u
    LEFT JOIN (
      SELECT pr.uf, count(*)::INT AS qtd
        FROM public.profiles pr
       WHERE pr.status = 'active' AND pr.uf IS NOT NULL
       GROUP BY pr.uf
    ) p ON p.uf = u.uf
    LEFT JOIN (
      SELECT ev.dim_uf AS uf,
             count(DISTINCT ev.user_id)::INT AS pessoas,
             count(*) FILTER (WHERE ev.event_type = 'impression') AS impressoes,
             count(*) FILTER (WHERE ev.event_type IN
               ('click','download','poll_vote','share','save','reaction','comment')) AS interacoes
        FROM public.feed_events ev
       WHERE ev.occurred_at >= p_desde AND ev.dim_uf IS NOT NULL
         AND (p_sponsor_id IS NULL OR ev.dim_sponsor_id = p_sponsor_id)
       GROUP BY ev.dim_uf
    ) e ON e.uf = u.uf
   ORDER BY COALESCE(e.impressoes, 0) DESC, u.uf;
$$;

COMMENT ON FUNCTION public.feed_mapa_do_brasil IS
  'Uma linha por UF, inclusive as sem profissional — estado vazio e informacao de cobertura.';

-- ---------------------------------------------------------------
-- Fila de cadastro incompleto, com o tamanho do buraco
-- ---------------------------------------------------------------
-- O painel precisa mostrar isto em destaque enquanto a base não estiver
-- preenchida: segmentar por cidade com ninguém tendo cidade devolve zero, e
-- sem esse aviso a impressão é de que a segmentação está quebrada.
CREATE OR REPLACE FUNCTION public.feed_saude_do_cadastro()
RETURNS TABLE(
  perfis_ativos INT, com_uf INT, com_cidade INT, com_tipo_de_piso INT,
  com_certificacao INT, com_fabricante INT, aparelhos_registrados INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.profiles WHERE status='active')::INT,
    (SELECT count(*) FROM public.profiles WHERE status='active' AND uf IS NOT NULL)::INT,
    (SELECT count(*) FROM public.profiles WHERE status='active' AND city_ibge_code IS NOT NULL)::INT,
    (SELECT count(DISTINCT profile_id) FROM public.profile_floor_types)::INT,
    (SELECT count(DISTINCT profile_id) FROM public.profile_certifications)::INT,
    (SELECT count(DISTINCT profile_id) FROM public.profile_manufacturers)::INT,
    (SELECT count(*) FROM public.device_tokens)::INT;
$$;

COMMENT ON FUNCTION public.feed_saude_do_cadastro IS
  'Quanto da base esta preenchida. Segmentacao boa com cadastro vazio devolve publico vazio.';

NOTIFY pgrst, 'reload schema';
