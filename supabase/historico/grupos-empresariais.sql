-- Confluir — Grupos empresariais (2026-10-09)
--
-- Um grupo empresarial reúne empresas de um mesmo conglomerado. Parte delas
-- (ou todas) tem trabalhadores representados pelo sindicato — são as fontes
-- pagadoras já cadastradas em Empregadores; as demais entram só com nome e
-- CNPJ, para o sindicato enxergar o tamanho real do grupo.
--
-- grupos_empresariais           → o grupo (nome, descrição) e se o grupo
--                                 PAGA AS CONTRIBUIÇÕES de forma centralizada
--                                 (uma relação só para todas as empresas).
-- grupo_empresarial_membros     → as empresas do grupo: empresa_id preenchido
--                                 = empregador representado (fonte pagadora);
--                                 vazio = empresa do grupo sem representação.
-- filiacao_recebe.grupo_empresarial_id → o lançamento veio da relação do
--                                 grupo (cada linha continua na fonte do
--                                 trabalhador).
--
-- Uma empresa representada pertence a no máximo um grupo. Idempotente.

create table if not exists grupos_empresariais (id uuid primary key default gen_random_uuid());
alter table grupos_empresariais add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table grupos_empresariais add column if not exists nome text not null default '';
alter table grupos_empresariais add column if not exists descricao text;
alter table grupos_empresariais add column if not exists contribuicao_centralizada boolean not null default false;
-- Empresa do grupo que faz o repasse (informativo; pode ficar vazio).
alter table grupos_empresariais add column if not exists empresa_pagadora_id uuid references empresa(id) on delete set null;
alter table grupos_empresariais add column if not exists created_at timestamptz not null default now();
alter table grupos_empresariais add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_grupos_empresariais_emp
  on grupos_empresariais (emp_proprietaria_id, nome);

create table if not exists grupo_empresarial_membros (id uuid primary key default gen_random_uuid());
alter table grupo_empresarial_membros add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table grupo_empresarial_membros add column if not exists grupo_id uuid references grupos_empresariais(id) on delete cascade;
alter table grupo_empresarial_membros add column if not exists empresa_id uuid references empresa(id) on delete cascade;
alter table grupo_empresarial_membros add column if not exists nome text;
alter table grupo_empresarial_membros add column if not exists cnpj text;
alter table grupo_empresarial_membros add column if not exists created_at timestamptz not null default now();

create index if not exists idx_grupo_membros_grupo
  on grupo_empresarial_membros (grupo_id);
-- Empregador representado: um grupo só.
create unique index if not exists uq_grupo_membros_empresa
  on grupo_empresarial_membros (emp_proprietaria_id, empresa_id)
  where empresa_id is not null;
-- Empresa sem representação: o mesmo CNPJ não se repete no grupo.
create unique index if not exists uq_grupo_membros_cnpj
  on grupo_empresarial_membros (grupo_id, cnpj)
  where empresa_id is null and cnpj is not null;

alter table filiacao_recebe add column if not exists grupo_empresarial_id uuid references grupos_empresariais(id) on delete set null;
-- Sem índice, excluir um grupo varre filiacao_recebe inteira (on delete set
-- null) e estoura o statement timeout. Parcial: só as linhas que vieram de grupo.
create index if not exists idx_filiacao_recebe_grupo
  on filiacao_recebe (grupo_empresarial_id)
  where grupo_empresarial_id is not null;

-- ── RLS por tenant ───────────────────────────────────────────────────────────

alter table grupos_empresariais enable row level security;
drop policy if exists tenant_isolation on grupos_empresariais;
create policy tenant_isolation on grupos_empresariais for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on grupos_empresariais to authenticated;
drop trigger if exists set_emp_from_jwt on grupos_empresariais;
create trigger set_emp_from_jwt before insert on grupos_empresariais
  for each row execute function public.set_emp_from_jwt();

alter table grupo_empresarial_membros enable row level security;
drop policy if exists tenant_isolation on grupo_empresarial_membros;
create policy tenant_isolation on grupo_empresarial_membros for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on grupo_empresarial_membros to authenticated;
drop trigger if exists set_emp_from_jwt on grupo_empresarial_membros;
create trigger set_emp_from_jwt before insert on grupo_empresarial_membros
  for each row execute function public.set_emp_from_jwt();

notify pgrst, 'reload schema';
