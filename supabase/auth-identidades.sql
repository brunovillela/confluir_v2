-- Confluir — Identidade das contas do portal/votação/oposição (2026-10-03)
--
-- POR QUÊ (achado S1 da avaliação de 03/10): a identidade do filiado e do
-- trabalhador não filiado vinha de `auth.users.user_metadata.cpf`, campo que
-- o PRÓPRIO usuário altera com `supabase.auth.updateUser({ data: { cpf } })`
-- e a anon key pública. Qualquer sessão (o autocadastro da oposição dá uma)
-- podia virar qualquer filiado e votar por ele.
--
-- AGORA: a identidade mora em `auth_identidades`, que só o servidor grava,
-- depois de provar a posse do e-mail do cadastro (senha ou código). Um CPF =
-- uma conta por tenant. Os fluxos por código registram ANTES do envio um
-- vínculo pendente (`auth_vinculos_pendentes`), com o par e-mail↔CPF que o
-- servidor derivou, e o consomem só DEPOIS de o código ser conferido — o
-- formulário nunca escolhe o CPF.
--
-- Mesmo padrão de RLS das demais tabelas tenant-owned (ver
-- supabase/contratos-minutas-config.sql e [[armadilha-rls-tabela-nova]]):
-- policy tenant_isolation + grant + trigger set_emp_from_jwt, e os nomes
-- entram em TABELAS_TENANT (src/lib/supabase/tabelas-tenant.ts).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.
-- Depois: node scripts/migrar-identidades-auth.mjs (dry-run) e --aplicar.

-- 1. Identidade da conta ------------------------------------------------------
create table if not exists public.auth_identidades (
  auth_user_id        uuid not null,
  emp_proprietaria_id uuid not null references public.empresa(id),
  -- Funcionário continua em usuarios.auth_user_id; hotel em
  -- hospedagem_hotel_usuarios.auth_user_id. Aqui ficam as portas públicas.
  tipo                text not null check (tipo in ('filiado', 'nao_filiado')),
  cpf                 text not null check (cpf ~ '^[0-9]{11}$'),
  nome                text,                       -- só para nao_filiado
  vinculada_em        timestamptz not null default now(),
  vinculada_por       text not null check (vinculada_por in ('senha', 'codigo', 'migracao')),
  primary key (auth_user_id, emp_proprietaria_id)
);
comment on table public.auth_identidades is
  'Quem é a conta Supabase Auth no tenant (CPF do filiado ou do trabalhador não filiado). Só o servidor grava, após prova de posse do e-mail.';

-- Um CPF = uma conta por tenant.
create unique index if not exists auth_identidades_cpf_unico
  on public.auth_identidades (emp_proprietaria_id, cpf);

alter table public.auth_identidades enable row level security;
drop policy if exists tenant_isolation on public.auth_identidades;
create policy tenant_isolation on public.auth_identidades for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.auth_identidades to authenticated;
drop trigger if exists set_emp_from_jwt on public.auth_identidades;
create trigger set_emp_from_jwt before insert on public.auth_identidades
  for each row execute function public.set_emp_from_jwt();

-- 2. Vínculo pendente (entre o envio do código e a sua confirmação) ------------
create table if not exists public.auth_vinculos_pendentes (
  id                  uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  email               text not null,              -- sempre em minúsculas
  tipo                text not null check (tipo in ('filiado', 'nao_filiado')),
  cpf                 text not null check (cpf ~ '^[0-9]{11}$'),
  nome                text,
  expira_em           timestamptz not null,
  created_at          timestamptz not null default now()
);
comment on table public.auth_vinculos_pendentes is
  'Par e-mail↔CPF derivado pelo servidor antes de enviar o código de acesso; consumido após o código ser conferido. Expira junto com o código.';

create index if not exists auth_vinculos_pendentes_email_idx
  on public.auth_vinculos_pendentes (emp_proprietaria_id, email);

alter table public.auth_vinculos_pendentes enable row level security;
drop policy if exists tenant_isolation on public.auth_vinculos_pendentes;
create policy tenant_isolation on public.auth_vinculos_pendentes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.auth_vinculos_pendentes to authenticated;
drop trigger if exists set_emp_from_jwt on public.auth_vinculos_pendentes;
create trigger set_emp_from_jwt before insert on public.auth_vinculos_pendentes
  for each row execute function public.set_emp_from_jwt();

-- 3. Conferência ---------------------------------------------------------------
-- select count(*) from auth_identidades;            -- 0 antes da migração
-- select tablename, rowsecurity from pg_tables
--  where tablename in ('auth_identidades','auth_vinculos_pendentes');
