-- Confluir — Cadência de códigos de acesso por e-mail (2026-10-03, item 0+b)
--
-- POR QUÊ: os fluxos públicos (portal, votação, oposição, mesário, apurador)
-- mandam um código para QUALQUER e-mail que a pessoa digite, sem limite. Dava
-- para encher a caixa de uma vítima e queimar a cota do provedor de e-mail.
--
-- AGORA: cada envio fica registrado aqui; lib/codigo-acesso.ts recusa mais de
-- 1 código por minuto e 5 por hora para o mesmo e-mail (resposta genérica,
-- sem dizer se o e-mail existe). O código tolera a tabela ausente (não trava
-- o login se este SQL ainda não rodou).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.auth_codigos_envios (
  id                  uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  email               text not null,              -- minúsculas
  enviado_em          timestamptz not null default now()
);
create index if not exists auth_codigos_envios_email_idx
  on public.auth_codigos_envios (emp_proprietaria_id, email, enviado_em desc);

alter table public.auth_codigos_envios enable row level security;
drop policy if exists tenant_isolation on public.auth_codigos_envios;
create policy tenant_isolation on public.auth_codigos_envios for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.auth_codigos_envios to authenticated;
drop trigger if exists set_emp_from_jwt on public.auth_codigos_envios;
create trigger set_emp_from_jwt before insert on public.auth_codigos_envios
  for each row execute function public.set_emp_from_jwt();

-- Limpeza: nada além de 24 h interessa. Pode ser agendada (pg_cron) ou
-- rodada à mão de vez em quando:
-- delete from public.auth_codigos_envios where enviado_em < now() - interval '1 day';
