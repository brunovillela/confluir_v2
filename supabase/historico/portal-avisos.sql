-- Confluir — Avisos no portal do associado (2026-10-04, onda 4 / F4)
--
-- O filiado não é `usuarios`, então o sino dele mora em tabela própria,
-- identificada pelo CPF (a mesma chave da sessão do portal). Preferência de
-- e-mail por tipo de aviso em tabela à parte, opt-out como no painel
-- (ausência de chave = ligado; `false` desliga). Tipos em
-- src/lib/portal-avisos-eventos.ts. O código tolera as tabelas ausentes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.portal_avisos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  cpf text not null,
  evento text not null,
  texto text not null,
  link text,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists portal_avisos_cpf_idx on public.portal_avisos (emp_proprietaria_id, cpf, created_at desc);
create index if not exists portal_avisos_nao_lidos_idx on public.portal_avisos (emp_proprietaria_id, cpf) where lida_em is null;

alter table public.portal_avisos enable row level security;
drop policy if exists tenant_isolation on public.portal_avisos;
create policy tenant_isolation on public.portal_avisos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.portal_avisos to authenticated;
drop trigger if exists set_emp_from_jwt on public.portal_avisos;
create trigger set_emp_from_jwt before insert on public.portal_avisos
  for each row execute function public.set_emp_from_jwt();

create table if not exists public.portal_avisos_preferencias (
  emp_proprietaria_id uuid not null,
  cpf text not null,
  email_prefs jsonb,
  updated_at timestamptz not null default now(),
  primary key (emp_proprietaria_id, cpf)
);
alter table public.portal_avisos_preferencias enable row level security;
drop policy if exists tenant_isolation on public.portal_avisos_preferencias;
create policy tenant_isolation on public.portal_avisos_preferencias for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.portal_avisos_preferencias to authenticated;
drop trigger if exists set_emp_from_jwt on public.portal_avisos_preferencias;
create trigger set_emp_from_jwt before insert on public.portal_avisos_preferencias
  for each row execute function public.set_emp_from_jwt();
