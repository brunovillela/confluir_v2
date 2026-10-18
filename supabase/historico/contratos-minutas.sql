-- Confluir — Assistente de minutas de contrato (2026-09-27)
--
-- A IA redige a MINUTA a partir dos dados que o usuário informa (tipo, partes,
-- objeto, valor, prazo, cláusulas desejadas) e da qualificação da entidade.
-- O usuário edita o texto, pede ajustes à IA e baixa em PDF ou Word.
--
-- ── POR QUE AQUI A IA ESCREVE CADA DOCUMENTO (e no termo de cessão não) ─────
-- O termo de cessão é um PADRÃO que vale para todas as cessões; aqui cada
-- contrato é um negócio diferente (objeto, obrigações, riscos). O que protege
-- a entidade é: a IA não inventa dado — o que falta vira [PREENCHER: …] —, o
-- texto passa pela revisão humana, e cada versão fica guardada.
--
-- contratos_minutas         → a minuta, com os dados informados e o texto atual
-- contratos_minutas_versoes → histórico (IA, ajuste pedido à IA, edição manual)
--
-- Uma minuta pode nascer de um contrato já cadastrado (contrato_id) ou antes
-- dele. Idempotente.

create table if not exists contratos_minutas (id uuid primary key default gen_random_uuid());
alter table contratos_minutas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table contratos_minutas add column if not exists contrato_id uuid references contratos(id) on delete set null;
alter table contratos_minutas add column if not exists titulo text;
alter table contratos_minutas add column if not exists tipo text;
-- Dados informados no formulário (partes, objeto, valor, prazo, cláusulas…).
alter table contratos_minutas add column if not exists parametros jsonb not null default '{}'::jsonb;
alter table contratos_minutas add column if not exists texto text;
alter table contratos_minutas add column if not exists versao integer not null default 0;
-- Finalizada = revisada e pronta para assinatura; o PDF deixa de sair como MINUTA.
alter table contratos_minutas add column if not exists finalizada boolean not null default false;
alter table contratos_minutas add column if not exists deletado boolean not null default false;
alter table contratos_minutas add column if not exists criado_por_id uuid references usuarios(id);
alter table contratos_minutas add column if not exists atualizado_por_id uuid references usuarios(id);
alter table contratos_minutas add column if not exists created_at timestamptz not null default now();
alter table contratos_minutas add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_contratos_minutas_emp
  on contratos_minutas (emp_proprietaria_id, deletado, updated_at desc);
create index if not exists idx_contratos_minutas_contrato
  on contratos_minutas (contrato_id) where contrato_id is not null;

comment on table contratos_minutas is
  'Minutas de contrato redigidas com a IA e revisadas pela entidade. parametros = dados informados; texto = versão atual.';

create table if not exists contratos_minutas_versoes (id uuid primary key default gen_random_uuid());
alter table contratos_minutas_versoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table contratos_minutas_versoes add column if not exists minuta_id uuid references contratos_minutas(id) on delete cascade;
alter table contratos_minutas_versoes add column if not exists versao integer not null;
alter table contratos_minutas_versoes add column if not exists texto text not null;
-- ia = primeira redação; ajuste = pedido à IA sobre o texto; edicao = mão do usuário; restauracao.
alter table contratos_minutas_versoes add column if not exists origem text not null default 'ia';
alter table contratos_minutas_versoes add column if not exists pedido text;
alter table contratos_minutas_versoes add column if not exists criado_por_id uuid references usuarios(id);
alter table contratos_minutas_versoes add column if not exists created_at timestamptz not null default now();

create index if not exists idx_contratos_minutas_versoes
  on contratos_minutas_versoes (minuta_id, versao desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contratos_minutas_versoes_origem_check') then
    alter table contratos_minutas_versoes
      add constraint contratos_minutas_versoes_origem_check
      check (origem in ('ia', 'ajuste', 'edicao', 'restauracao'));
  end if;
end $$;

-- ── Isolamento por tenant (mesmo padrão das demais tabelas) ─────────────────

alter table contratos_minutas enable row level security;
drop policy if exists tenant_isolation on contratos_minutas;
create policy tenant_isolation on contratos_minutas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on contratos_minutas to authenticated;
drop trigger if exists set_emp_from_jwt on contratos_minutas;
create trigger set_emp_from_jwt before insert on contratos_minutas
  for each row execute function public.set_emp_from_jwt();

alter table contratos_minutas_versoes enable row level security;
drop policy if exists tenant_isolation on contratos_minutas_versoes;
create policy tenant_isolation on contratos_minutas_versoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on contratos_minutas_versoes to authenticated;
drop trigger if exists set_emp_from_jwt on contratos_minutas_versoes;
create trigger set_emp_from_jwt before insert on contratos_minutas_versoes
  for each row execute function public.set_emp_from_jwt();
