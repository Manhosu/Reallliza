-- 076 — Saber o que impede uma exclusão, antes de tentar
--
-- A Jéssica relatou dois sintomas do mesmo problema: a ferramenta cadastrada
-- para teste não tem botão de excluir, e a OS tem botão que dá erro.
--
-- O erro da OS é violação de chave estrangeira virando "Falha ao excluir OS"
-- — um 500 sem diagnóstico. Em produção, 39 das 41 OS estão nessa situação,
-- 38 delas porque vieram de um orçamento. Ou seja: o botão praticamente nunca
-- funciona, e quando não funciona não explica.
--
-- A saída não é apagar mais coisa. É a tela saber, ANTES de tentar, o que
-- segura aquele registro — e dizer isso em português.
--
-- Esta função responde essa pergunta para QUALQUER tabela, lendo o catálogo
-- do próprio Postgres. Sem ela seria preciso escrever a checagem à mão em
-- cada um dos vinte e tantos cadastros, e refazer toda vez que uma migration
-- nova acrescentasse um dependente — que é exatamente o que aconteceu com a
-- rota da OS: ela lista os "filhos" da migration 016 e nunca foi atualizada
-- quando as 027, 029, 039 e 040 acrescentaram outros.

CREATE OR REPLACE FUNCTION public.dependentes_de(p_tabela TEXT, p_id UUID)
RETURNS TABLE(tabela TEXT, coluna TEXT, acao TEXT, quantidade BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_n BIGINT;
BEGIN
  FOR r IN
    SELECT c.relname AS tab, a.attname AS col, con.confdeltype AS del
      FROM pg_constraint con
      JOIN pg_class     c    ON c.oid    = con.conrelid
      JOIN pg_class     alvo ON alvo.oid = con.confrelid
      JOIN pg_namespace n    ON n.oid    = c.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY k(att, ord) ON true
      JOIN pg_attribute a    ON a.attrelid = c.oid AND a.attnum = k.att
     WHERE con.contype = 'f'
       AND alvo.relname = p_tabela
       AND n.nspname = 'public'
       -- Chave composta escaparia da contagem simples abaixo. Não existe
       -- nenhuma apontando para os cadastros deste sistema; se surgir, é
       -- melhor ignorar do que contar errado.
       AND array_length(con.conkey, 1) = 1
  LOOP
    -- %I cita o identificador; o nome vem do catálogo, não do chamador.
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tab, r.col)
       INTO v_n USING p_id;

    IF v_n > 0 THEN
      tabela     := r.tab;
      coluna     := r.col;
      acao       := CASE r.del
                      WHEN 'c' THEN 'cascade'
                      WHEN 'n' THEN 'set_null'
                      WHEN 'd' THEN 'set_default'
                      ELSE 'block'
                    END;
      quantidade := v_n;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.dependentes_de IS
  'O que aponta para este registro, e se impede a exclusao. Usada para explicar antes de tentar.';

-- Revogar de `anon` e `authenticated` não basta: o Postgres concede EXECUTE a
-- PUBLIC por padrão em toda função nova, e é dessa concessão que os dois
-- papéis herdam o acesso. Numa função SECURITY DEFINER isso deixaria qualquer
-- portador da chave pública contar dependentes de qualquer registro.
REVOKE ALL ON FUNCTION public.dependentes_de(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dependentes_de(TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dependentes_de(TEXT, UUID) TO service_role;

-- ---------------------------------------------------------------
-- A ferramenta impedida de ser apagada pelo registro de que foi criada
-- ---------------------------------------------------------------
-- Toda ferramenta tem um evento `cadastro`, gravado no momento em que ela é
-- criada. Como `tool_events.tool_id` é RESTRICT, esse evento — e só ele —
-- basta para tornar a ferramenta indelével. Três das nove ferramentas em
-- produção estão exatamente nesse estado: nenhuma custódia, nenhuma unidade,
-- só o registro do próprio cadastro.
--
-- A migration 058 endureceu essas chaves com a intenção certa ("nenhum
-- histórico poderá ser apagado"), mas o histórico de uma ferramenta que
-- deixou de existir não é histórico de nada. Custódia, manutenção e baixa
-- continuam bloqueando — esses SÃO uso real.
ALTER TABLE public.tool_events DROP CONSTRAINT IF EXISTS tool_events_tool_id_fkey;
ALTER TABLE public.tool_events
  ADD CONSTRAINT tool_events_tool_id_fkey
  FOREIGN KEY (tool_id) REFERENCES public.tool_inventory(id) ON DELETE CASCADE;

ALTER TABLE public.tool_events DROP CONSTRAINT IF EXISTS tool_events_unit_id_fkey;
ALTER TABLE public.tool_events
  ADD CONSTRAINT tool_events_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES public.tool_units(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------
-- A OS de retrabalho não deve impedir a exclusão da que a originou
-- ---------------------------------------------------------------
-- `parent_service_order_id` ficou sem cláusula, então virou NO ACTION: a OS
-- original não pode ser apagada enquanto existir uma OS filha. Mas a filha
-- sobrevive perfeitamente sem o pai — ela perde a referência, não o sentido.
--
-- Orçamento, fatura e garantia continuam bloqueando de propósito: são
-- registros com consequência financeira ou contratual.
ALTER TABLE public.service_orders DROP CONSTRAINT IF EXISTS service_orders_parent_service_order_id_fkey;
ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_parent_service_order_id_fkey
  FOREIGN KEY (parent_service_order_id) REFERENCES public.service_orders(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
