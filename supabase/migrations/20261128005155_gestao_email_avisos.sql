-- POR QUÊ: Gestão (27/11/2026), fase 5 da gestão do e-mail. As fases 1 a 4
--   registram, mostram e controlam o envio, mas a Gestão só via um problema
--   quando abria a tela: o teto chegando ao fim, a cota de um departamento, a
--   rejeição subindo (o domínio perdendo reputação), a chave da conta própria
--   recusada, o remetente fora dos domínios verificados ou o provedor falhando
--   em sequência. A fase 5 avisa a Gestão (sino, e-mail, Telegram) — e cada
--   aviso precisa sair uma vez só por período, mesmo com centenas de e-mails
--   saindo ao mesmo tempo.
-- COMO:
--   email_avisos: uma linha por aviso dado (chave = tipo + período, ex.:
--   "teto:2026-11:80", "chave:2026-11-27"). O aviso só sai quando o insert
--   entra; o que conflita com a chave única já foi avisado. Sem dado pessoal.
--   Idempotente.

create table if not exists public.email_avisos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  chave text not null,
  criado_em timestamptz not null default now()
);

create unique index if not exists email_avisos_emp_chave_uniq on public.email_avisos (emp_proprietaria_id, chave);

alter table public.email_avisos enable row level security;
drop policy if exists tenant_isolation on public.email_avisos;
create policy tenant_isolation on public.email_avisos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.email_avisos from public, anon;
grant select, insert, update, delete on table public.email_avisos to authenticated;
grant all on table public.email_avisos to service_role;
drop trigger if exists set_emp_from_jwt on public.email_avisos;
create trigger set_emp_from_jwt before insert on public.email_avisos
  for each row execute function public.set_emp_from_jwt();

comment on table public.email_avisos is 'Avisos do e-mail já dados à Gestão (Gestão › E-mail, 27/11/2026 — fase 5): teto e cota a 80%/100%, rejeição alta, chave da conta própria recusada, remetente fora dos domínios verificados, falhas seguidas. A chave única impede o aviso repetido no mesmo período. [lgpd:nenhum]';
comment on column public.email_avisos.chave is 'Tipo do aviso e período (ex.: teto:2026-11:80, cota:<departamento>:2026-11:100, chave:2026-11-27).';
