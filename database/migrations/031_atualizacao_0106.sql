-- Marco 7 / Ajustes Jessica 01/06/2026
--
-- Bloco 1 do plano `C:\Users\delas\.claude\plans\clever-cooking-wind.md`:
-- preparar schema pras 7 áreas atualizadas pela Jessica + retrabalho.
--
-- Idempotente: roda múltiplas vezes sem quebrar.

-- ============================================================
-- 1. Especialidades — seed das 7 atuais
-- ============================================================
-- A tabela `public.specialties (id, name UNIQUE, description, order_index,
-- is_active, created_at, updated_at)` já existe (Marco 6). Garantimos que
-- as 7 que a Jessica usa hoje estão ativas.
insert into public.specialties (name, order_index, is_active) values
  ('Rodapé', 1, true),
  ('Painel de parede', 2, true),
  ('Forro', 3, true),
  ('Piso vinílico colado', 4, true),
  ('Piso vinílico clicado', 5, true),
  ('Acabamentos', 6, true),
  ('Atendimento ao cliente', 7, true)
on conflict (name) do nothing;

-- ============================================================
-- 2. technician_specialty_scores — média por especialidade
-- ============================================================
-- "A média de cada especialidade deve ser calculada apenas pelas OS em que
-- aquela especialidade foi executada." Mantemos uma tabela materializada
-- pra render rápido no Perfil mobile sem agregar a cada request.
create table if not exists public.technician_specialty_scores (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.profiles(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  os_count int not null default 0,
  score_avg numeric(3,1) not null default 0,   -- 0.0 .. 5.0
  last_recalc_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (technician_id, specialty_id)
);

create index if not exists idx_tech_spec_scores_tech
  on public.technician_specialty_scores (technician_id);
create index if not exists idx_tech_spec_scores_spec
  on public.technician_specialty_scores (specialty_id);

-- RLS: técnico lê seus próprios scores; admin/manager lê tudo.
alter table public.technician_specialty_scores enable row level security;

drop policy if exists "tss_select_own" on public.technician_specialty_scores;
create policy "tss_select_own" on public.technician_specialty_scores
  for select using (
    technician_id = auth.uid()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- 3. service_order_specialties — many-to-many OS ↔ especialidades
-- ============================================================
-- Uma OS pode ter N especialidades. Importante pra penalizar só a
-- especialidade do retrabalho (não as outras da mesma OS).
create table if not exists public.service_order_specialties (
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (service_order_id, specialty_id)
);

create index if not exists idx_sos_specialty
  on public.service_order_specialties (specialty_id);

alter table public.service_order_specialties enable row level security;

drop policy if exists "sos_select_authenticated" on public.service_order_specialties;
create policy "sos_select_authenticated" on public.service_order_specialties
  for select using (auth.uid() is not null);

drop policy if exists "sos_write_admin" on public.service_order_specialties;
create policy "sos_write_admin" on public.service_order_specialties
  for all using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- 4. os_projects — anexos de projeto da OS (PDF + imagem)
-- ============================================================
-- "Imagens do Local" → "Projetos". Aceita PDF e imagem, só admin sobe pelo
-- web; técnico apenas visualiza no app.
create table if not exists public.os_projects (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  file_url text not null,
  file_name text,
  mime_type text not null,    -- image/jpeg | image/png | image/webp | application/pdf
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_os_projects_so
  on public.os_projects (service_order_id);

alter table public.os_projects enable row level security;

-- SELECT: técnico atribuído à OS ou admin.
drop policy if exists "os_projects_select" on public.os_projects;
create policy "os_projects_select" on public.os_projects
  for select using (
    exists (
      select 1 from public.service_orders so
      where so.id = os_projects.service_order_id
        and (so.technician_id = auth.uid()
             or exists (select 1 from public.profiles p
                        where p.id = auth.uid() and p.role = 'admin'))
    )
  );

-- INSERT/UPDATE/DELETE: só admin.
drop policy if exists "os_projects_write_admin" on public.os_projects;
create policy "os_projects_write_admin" on public.os_projects
  for all using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- 5. Retrabalho — colunas extras em service_orders
-- ============================================================
-- `parent_service_order_id` e `is_rework` já existem (migration 027).
-- Adicionamos: especialidade específica do retrabalho + motivo.
alter table public.service_orders
  add column if not exists rework_specialty_id uuid
    references public.specialties(id) on delete set null,
  add column if not exists rework_reason text;

create index if not exists idx_service_orders_rework_spec
  on public.service_orders (rework_specialty_id)
  where rework_specialty_id is not null;

-- ============================================================
-- 6. schedules.source — expandir CHECK pra incluir proposta aceita
-- ============================================================
-- Coluna `source` já existe (CHECK em 'manual' | 'os'). Precisamos aceitar
-- 'proposal_accepted' também — substituímos o CHECK.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.schedules'::regclass
    and pg_get_constraintdef(oid) ilike '%source%manual%';
  if cname is not null then
    execute format('alter table public.schedules drop constraint %I', cname);
  end if;
end$$;

alter table public.schedules
  add constraint schedules_source_check
  check (source in ('manual','os','os_assignment','proposal_accepted'));

-- Backfill conceitual: schedules antigos com source='os' continuam válidos
-- ('os' = atribuição direta, compat retro). 'os_assignment' é o nome novo
-- pra atribuição automática, deixamos os dois pra não quebrar histórico.
