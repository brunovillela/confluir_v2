-- Confluir — fonte pagadora sem valores a repassar
--
-- POR QUÊ: no controle de envio das relações de desconto (migração
-- 20261108183536), uma empresa cujos trabalhadores se desfiliaram todos (ou
-- que deixou de descontar) continuava aparecendo como "relação atrasada" mês
-- após mês. O "sem desconto no mês" resolve um mês só; aqui a entidade
-- registra, de uma vez, que a empresa não tem valores a repassar a partir de
-- uma competência, com o motivo, até voltar a ter desconto.
--
-- COMO: `filiacao_repasse_sem_valores`, um período por linha: `desde` (AAAAMM)
-- e `ate` (AAAAMM, null = em aberto). Vale para todos os tipos de
-- contribuição. Só um período em aberto por empresa. Encerrar o período
-- ("voltou a ter desconto") grava `ate` e quem encerrou; o histórico fica.
-- Idempotente.

create table if not exists public.filiacao_repasse_sem_valores (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  desde integer not null check (desde between 200001 and 210012 and desde % 100 between 1 and 12),
  ate integer check (ate is null or (ate between 200001 and 210012 and ate % 100 between 1 and 12)),
  motivo text not null check (length(trim(motivo)) > 0),
  registrado_em timestamptz not null default now(),
  registrado_por_id uuid,
  registrado_por text,
  encerrado_em timestamptz,
  encerrado_por text,
  constraint filiacao_repasse_sem_valores_periodo check (ate is null or ate >= desde)
);

create unique index if not exists filiacao_repasse_sem_valores_aberto
  on public.filiacao_repasse_sem_valores (emp_proprietaria_id, empresa_id)
  where ate is null;

alter table public.filiacao_repasse_sem_valores enable row level security;
drop policy if exists tenant_isolation on public.filiacao_repasse_sem_valores;
create policy tenant_isolation on public.filiacao_repasse_sem_valores to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.filiacao_repasse_sem_valores;
create trigger set_emp_from_jwt before insert on public.filiacao_repasse_sem_valores
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.filiacao_repasse_sem_valores from public, anon;
grant select, insert, update, delete on table public.filiacao_repasse_sem_valores to authenticated;
grant all on table public.filiacao_repasse_sem_valores to service_role;

comment on table public.filiacao_repasse_sem_valores is 'Períodos em que uma fonte pagadora não tem valores a repassar ao sindicato (ex.: todos os trabalhadores se desfiliaram): o controle de envio não cobra a relação nesses meses. Vale para todos os tipos de contribuição (09/11/2026). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.filiacao_repasse_sem_valores.empresa_id is 'Fonte pagadora (no grupo centralizado, a empresa pagadora).';
comment on column public.filiacao_repasse_sem_valores.desde is 'Primeira competência (AAAAMM) sem valores a repassar.';
comment on column public.filiacao_repasse_sem_valores.ate is 'Última competência (AAAAMM) sem valores; null = período em aberto.';
comment on column public.filiacao_repasse_sem_valores.motivo is 'Por que não há valores (ex.: todos os trabalhadores se desfiliaram). [lgpd:nenhum]';
comment on column public.filiacao_repasse_sem_valores.registrado_por_id is 'Quem registrou. [lgpd:identificacao]';
comment on column public.filiacao_repasse_sem_valores.registrado_por is 'Nome de quem registrou, no momento do registro. [lgpd:identificacao]';
comment on column public.filiacao_repasse_sem_valores.encerrado_em is 'Quando o período foi encerrado (a empresa voltou a ter desconto).';
comment on column public.filiacao_repasse_sem_valores.encerrado_por is 'Nome de quem encerrou o período. [lgpd:identificacao]';
