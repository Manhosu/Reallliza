-- 069 — Fecha as views que atravessavam a RLS
--
-- Achado ao expor a curva de retenção: as três views do schema `public`
-- eram legíveis com a chave anônima, que é pública por definição — ela vai
-- dentro do aplicativo e do bundle do site.
--
-- Duas coisas se somavam:
--
-- 1. View no Postgres roda, por padrão, com os privilégios de quem a criou.
--    A RLS das tabelas por baixo simplesmente não é consultada. `profiles`
--    está corretamente protegida e devolvia `[]` para o anônimo; a view
--    `feed_audience_profile_v`, montada sobre ela, devolvia UF, cidade,
--    nível, tipo profissional e situação de homologação de todo mundo.
--
-- 2. O Supabase concede SELECT a `anon` e `authenticated` por padrão em tudo
--    que nasce no schema `public`.
--
-- A correção tem as duas metades, porque cada uma sozinha é frágil:
-- `security_invoker` faz a RLS da tabela valer, e o REVOKE tira o objeto do
-- alcance da API pública. As três views só são consumidas por função
-- SECURITY DEFINER ou por rota com service-role — nenhuma delas passa por
-- `anon`/`authenticated`, então revogar não quebra caminho nenhum.
--
-- Dentro de uma função SECURITY DEFINER o usuário corrente é o dono, que
-- tem BYPASSRLS; o motor de audiência continua enxergando a base inteira.

ALTER VIEW public.feed_audience_profile_v SET (security_invoker = on);
ALTER VIEW public.feed_video_retencao_v   SET (security_invoker = on);
ALTER VIEW public.perfis_sem_geo          SET (security_invoker = on);

REVOKE ALL ON public.feed_audience_profile_v FROM anon, authenticated;
REVOKE ALL ON public.feed_video_retencao_v   FROM anon, authenticated;
REVOKE ALL ON public.perfis_sem_geo          FROM anon, authenticated;

COMMENT ON VIEW public.feed_audience_profile_v IS
  'Uso interno do motor de audiencia. Sem acesso por anon/authenticated: expoe recorte pessoal.';
COMMENT ON VIEW public.perfis_sem_geo IS
  'Uso interno: fila de perfis sem UF/cidade. Sem acesso por anon/authenticated.';

-- Sem isso o PostgREST continua servindo pelo cache de schema antigo.
NOTIFY pgrst, 'reload schema';
