-- Marco 7 / Ajustes Jessica 28/05 — campos extras no profile + estrelas por especialidade.
--
-- A coluna `cpf` e `address` já existem em `profiles` na Execução
-- (confirmado via types.ts:105-107). Esta migration adiciona apenas
-- a coluna nova `specialty_ratings` (jsonb) que permite registrar
-- a proficiência do técnico em cada especialidade individual.
--
-- Formato esperado:
--   [{"name": "Rodapé", "stars": 3}, {"name": "Painel", "stars": 5}, ...]
--
-- `specialties text[]` continua existindo (não tocar — backward compat).
-- Quando `specialty_ratings` está preenchido, ele é a fonte de verdade
-- e o mobile renderiza estrelas; senão cai no fallback antigo.

alter table public.profiles
  add column if not exists specialty_ratings jsonb not null default '[]'::jsonb;

create index if not exists idx_profiles_specialty_ratings
  on public.profiles using gin (specialty_ratings);

-- Backfill: pra cada profile com specialties != null, cria specialty_ratings
-- com stars: 0 (ainda não avaliado) — assim os técnicos antigos não
-- "perdem" suas especialidades, só ficam sem estrelas até alguém avaliar.
update public.profiles
set specialty_ratings = (
  select coalesce(jsonb_agg(jsonb_build_object('name', s, 'stars', 0)), '[]'::jsonb)
  from unnest(specialties) as s
)
where (specialty_ratings = '[]'::jsonb or specialty_ratings is null)
  and specialties is not null
  and cardinality(specialties) > 0;
