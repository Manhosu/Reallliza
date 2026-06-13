-- 2026-06-13 — Fix mojibake "Ã§Ã£o" / "Ã©" / "Ã­" em step_template_items.
--
-- Origem: a seed dos templates foi gravada com texto UTF-8 mas o byte
-- sequence foi interpretado como WIN1252 antes da escrita, virando
-- double-encoded. Resultado visível no app (Print 3, Jessica 10/06):
-- "AplicaÃ§Ã£o de primer".
--
-- Estratégia: usar convert_from(convert_to(text, 'WIN1252'), 'UTF8') que
-- desfaz o double-encoding de Latin-1/WIN1252→UTF-8. Idempotente para
-- nomes já corretos (sem `Ã`), porque eles não disparam o WHERE.
--
-- Também ajusta o metadata.name dos os_step_executions já provisionados
-- (snapshot do template) para corrigir histórico.

BEGIN;

-- 1. Tabela mestra
UPDATE public.step_template_items
SET name = convert_from(convert_to(name, 'WIN1252'), 'UTF8')
WHERE name LIKE '%Ã%';

UPDATE public.step_template_items
SET description = convert_from(convert_to(description, 'WIN1252'), 'UTF8')
WHERE description LIKE '%Ã%';

-- 2. Snapshots já feitos em os_step_executions
UPDATE public.os_step_executions
SET metadata = jsonb_set(
  metadata,
  '{name}',
  to_jsonb(convert_from(convert_to(metadata->>'name', 'WIN1252'), 'UTF8'))
)
WHERE metadata->>'name' LIKE '%Ã%';

UPDATE public.os_step_executions
SET metadata = jsonb_set(
  metadata,
  '{description}',
  to_jsonb(convert_from(convert_to(metadata->>'description', 'WIN1252'), 'UTF8'))
)
WHERE metadata->>'description' LIKE '%Ã%';

COMMIT;
