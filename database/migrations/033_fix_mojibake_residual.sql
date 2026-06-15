-- 2026-06-15 — Fix mojibake residual em step_template_groups.
--
-- Migration 032 cobriu step_template_items + os_step_executions. Faltavam
-- os nomes/descrições do GRUPO (template). Jessica viu "InstalaÃ§Ã£o de
-- Piso VinÃ­lico Colado" no select "Template de Execução".
--
-- Mesma estratégia: convert_from(convert_to(text, 'WIN1252'), 'UTF8').
-- Filtra por padrões DOUBLE-encoded reais (Ã seguido de §£©­¡³º etc.) para
-- evitar falso-positivo em palavras corretas tipo "INSTALAÇÃO" (que tem
-- "ÃO" legítimo no UTF-8).

BEGIN;

UPDATE public.step_template_groups
SET name = convert_from(convert_to(name, 'WIN1252'), 'UTF8')
WHERE name ~ 'Ã[§£©¡­³º¢¦¨ª«¬®¯°±²´µ¶·¸¹»¼½¾¿]';

UPDATE public.step_template_groups
SET description = convert_from(convert_to(description, 'WIN1252'), 'UTF8')
WHERE description ~ 'Ã[§£©¡­³º¢¦¨ª«¬®¯°±²´µ¶·¸¹»¼½¾¿]';

COMMIT;
