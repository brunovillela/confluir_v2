-- ============================================================================
-- CAT: duplicidades e atualizações (2026-09-19). Idempotente — rodar no SQL
-- Editor do Supabase.
--
-- Pedido do Bruno: ao ler uma CAT por IA ou digitar uma, dizer se ela é NOVA,
-- se JÁ EXISTE (duplicada) ou se é uma ATUALIZAÇÃO de uma CAT da base
-- (reabertura, comunicação de óbito / evolução para morte), e uma sub-área
-- para tratar os casos — como a de Filiados.
--
-- Varredura de 19/09 (13.094 CATs): 152 números repetidos; 36 acidentes com o
-- mesmo número-base e sequência diferente (…/01 × …/02 — a /02 é a reabertura
-- ou o óbito); 176 pares com o mesmo acidentado e a mesma data do acidente.
--
-- • cat_origem_id: a CAT de atualização aponta para a CAT de origem (a inicial).
-- • duplicada_de_id: cópia descartada de uma CAT repetida — aponta para a que
--   fica e sai das listas, do painel e da exportação. Nada é apagado.
-- • saude_cat_duplicidades_ignoradas: grupos conferidos que NÃO são duplicidade
--   nem atualização, para não voltarem à lista.
-- ============================================================================

alter table saude_cat add column if not exists cat_origem_id uuid references saude_cat(id) on delete set null;
alter table saude_cat add column if not exists duplicada_de_id uuid references saude_cat(id) on delete set null;
alter table saude_cat add column if not exists descartada_em timestamptz;
alter table saude_cat add column if not exists descartada_por uuid references usuarios(id);

comment on column saude_cat.cat_origem_id is
  'CAT de origem (inicial) desta CAT de reabertura ou comunicação de óbito.';
comment on column saude_cat.duplicada_de_id is
  'Esta CAT é cópia descartada da CAT indicada; fica fora das listas. Nada é apagado.';

create index if not exists idx_saude_cat_origem on saude_cat (cat_origem_id) where cat_origem_id is not null;
create index if not exists idx_saude_cat_duplicada on saude_cat (duplicada_de_id) where duplicada_de_id is not null;

create table if not exists saude_cat_duplicidades_ignoradas (id uuid primary key default gen_random_uuid());
alter table saude_cat_duplicidades_ignoradas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table saude_cat_duplicidades_ignoradas add column if not exists tipo text not null default 'acidente';
alter table saude_cat_duplicidades_ignoradas add column if not exists chave text not null default '';
alter table saude_cat_duplicidades_ignoradas add column if not exists cats uuid[] not null default '{}';
alter table saude_cat_duplicidades_ignoradas add column if not exists motivo text;
alter table saude_cat_duplicidades_ignoradas add column if not exists criado_por uuid references usuarios(id);
alter table saude_cat_duplicidades_ignoradas add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_saude_cat_duplicidades_ignoradas
  on saude_cat_duplicidades_ignoradas (emp_proprietaria_id, tipo, chave);

alter table saude_cat_duplicidades_ignoradas enable row level security;
drop policy if exists tenant_isolation on saude_cat_duplicidades_ignoradas;
create policy tenant_isolation on saude_cat_duplicidades_ignoradas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on saude_cat_duplicidades_ignoradas to authenticated;
drop trigger if exists set_emp_from_jwt on saude_cat_duplicidades_ignoradas;
create trigger set_emp_from_jwt before insert on saude_cat_duplicidades_ignoradas
  for each row execute function public.set_emp_from_jwt();
