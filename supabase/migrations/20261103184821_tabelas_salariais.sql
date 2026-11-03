-- Confluir — Níveis salariais: tabelas salariais guardadas com vigência (03/11/2026)
--
-- POR QUÊ: a tabela salarial era uma só: um novo acordo sobrescrevia os valores
-- e os anteriores se perdiam. A entidade quer guardar as tabelas no banco e
-- saber qual é a vigente, o início e o término de cada uma e o nome, no formato
-- "[Ano de início] - [Ano de término]".
--
-- COMO: pessoal_tabelas_salariais = uma tabela por período, com no máximo uma
-- vigente por entidade. pessoal_nivel_salarial_base ganha tabela_id: cada degrau
-- pertence a uma tabela. Os degraus que já existem entram numa tabela vigente da
-- entidade, sem datas nem nome: o gestor informa a vigência no formulário
-- (Níveis salariais → Tabelas e vigências). Nenhum salário muda aqui. Idempotente.

create table if not exists public.pessoal_tabelas_salariais (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  nome text,
  data_inicio date,
  data_fim date,
  vigente boolean not null default false,
  criado_por uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_tabelas_salariais_datas_check
    check ((data_inicio is null) = (data_fim is null) and (data_fim is null or data_fim >= data_inicio))
);

create unique index if not exists pessoal_tabelas_salariais_vigente_idx
  on public.pessoal_tabelas_salariais (emp_proprietaria_id) where vigente;
create unique index if not exists pessoal_tabelas_salariais_periodo_idx
  on public.pessoal_tabelas_salariais (emp_proprietaria_id, data_inicio, data_fim);

alter table public.pessoal_tabelas_salariais enable row level security;
drop policy if exists tenant_isolation on public.pessoal_tabelas_salariais;
create policy tenant_isolation on public.pessoal_tabelas_salariais to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.pessoal_tabelas_salariais;
create trigger set_emp_from_jwt before insert on public.pessoal_tabelas_salariais
  for each row execute function public.set_emp_from_jwt();
drop trigger if exists auditoria_registrar on public.pessoal_tabelas_salariais;
create trigger auditoria_registrar after insert or update or delete on public.pessoal_tabelas_salariais
  for each row execute function public.registrar_auditoria();
revoke all on table public.pessoal_tabelas_salariais from public, anon;
grant select, insert, update, delete on table public.pessoal_tabelas_salariais to authenticated;
grant all on table public.pessoal_tabelas_salariais to service_role;

alter table public.pessoal_nivel_salarial_base
  add column if not exists tabela_id uuid references public.pessoal_tabelas_salariais(id);
create index if not exists pessoal_nivel_salarial_base_tabela_idx
  on public.pessoal_nivel_salarial_base (tabela_id);

-- A tabela de hoje de cada entidade: vigente, à espera da vigência no formulário.
insert into public.pessoal_tabelas_salariais (emp_proprietaria_id, vigente)
select distinct b.emp_proprietaria_id, true
from public.pessoal_nivel_salarial_base b
where b.emp_proprietaria_id is not null
  and b.tabela_id is null
  and not exists (
    select 1 from public.pessoal_tabelas_salariais t
    where t.emp_proprietaria_id = b.emp_proprietaria_id and t.vigente
  );

update public.pessoal_nivel_salarial_base b
set tabela_id = t.id
from public.pessoal_tabelas_salariais t
where b.tabela_id is null
  and t.emp_proprietaria_id = b.emp_proprietaria_id
  and t.vigente;

comment on table public.pessoal_tabelas_salariais is 'Tabela salarial de um período, com os degraus em pessoal_nivel_salarial_base; no máximo uma vigente por entidade (src/lib/db/tabelas-salariais.ts). [lgpd:identificacao|titulares:funcionários]';
comment on column public.pessoal_tabelas_salariais.id is 'Identificador da tabela.';
comment on column public.pessoal_tabelas_salariais.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_tabelas_salariais.nome is 'Gerado pelo sistema: "[Ano de início] - [Ano de término]". Vazio até informar a vigência.';
comment on column public.pessoal_tabelas_salariais.data_inicio is 'Início da vigência.';
comment on column public.pessoal_tabelas_salariais.data_fim is 'Término da vigência.';
comment on column public.pessoal_tabelas_salariais.vigente is 'Se é a tabela em uso: os lançamentos e o reajuste trabalham com ela.';
comment on column public.pessoal_tabelas_salariais.criado_por is 'Quem cadastrou. [lgpd:identificacao]';
comment on column public.pessoal_tabelas_salariais.created_at is 'Criação da tabela.';
comment on column public.pessoal_tabelas_salariais.updated_at is 'Última alteração da tabela.';
comment on column public.pessoal_nivel_salarial_base.tabela_id is 'Tabela salarial a que o degrau pertence.';
