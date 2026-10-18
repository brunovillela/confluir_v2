-- Confluir — Bloqueio progressivo por conta no login (2026-10-03, onda 1 / S6)
--
-- POR QUÊ: o Supabase limita tentativas por IP e o Turnstile barra robôs, mas
-- nada impedia alguém de testar senhas de UMA conta devagar, de vários lugares.
-- Agora cada falha de senha conta para o identificador (e-mail ou CPF) no
-- tenant; 5 falhas seguidas bloqueiam por 15 min e 10 por 1 h. Um acerto zera.
-- lib/login-bloqueio.ts tolera a tabela ausente (não tranca o login se este
-- SQL ainda não rodou).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.login_tentativas (
  id                  uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  chave               text not null,              -- "senha:<e-mail>" ou "senha:<cpf>"
  falhas              integer not null default 0,
  ultima_falha_em     timestamptz,
  bloqueado_ate       timestamptz,
  unique (emp_proprietaria_id, chave)
);

alter table public.login_tentativas enable row level security;
drop policy if exists tenant_isolation on public.login_tentativas;
create policy tenant_isolation on public.login_tentativas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.login_tentativas to authenticated;
drop trigger if exists set_emp_from_jwt on public.login_tentativas;
create trigger set_emp_from_jwt before insert on public.login_tentativas
  for each row execute function public.set_emp_from_jwt();

-- Limpeza opcional: registros parados há mais de um dia não interessam.
-- delete from public.login_tentativas where coalesce(bloqueado_ate, ultima_falha_em) < now() - interval '1 day';
