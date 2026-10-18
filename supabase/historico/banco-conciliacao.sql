-- Confluir — Conciliação bancária por arquivo (2026-10-04, onda 5 / A1)
--
-- O extrato importado (OFX ou CSV) vira um registro em `banco_extratos` e um
-- lançamento por linha em `banco_lancamentos`. Cada lançamento é casado com
-- uma ordem PAGA (débito) ou com um depósito de fonte pagadora
-- (`filiacao_recebe_comprovacao`, crédito) — automaticamente quando há um
-- único candidato, ou à mão na tela Financeiro → Conciliação. O lançamento
-- nunca muda a ordem; ele só aponta para ela. `chave` evita importar a mesma
-- linha duas vezes (FITID do OFX ou hash de data+valor+descrição).
-- O código tolera as tabelas ausentes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.banco_extratos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  nome_arquivo text,
  origem text not null check (origem in ('ofx', 'csv', 'api')),
  conta_rotulo text,
  banco text,
  agencia text,
  conta text,
  periodo_de date,
  periodo_ate date,
  saldo_final numeric(14,2),
  total_lancamentos int not null default 0,
  novos_lancamentos int not null default 0,
  importado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists banco_extratos_emp_idx on public.banco_extratos (emp_proprietaria_id, created_at desc);

create table if not exists public.banco_lancamentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  extrato_id uuid not null references public.banco_extratos (id) on delete cascade,
  data date not null,
  valor numeric(14,2) not null,
  descricao text,
  documento text,
  tipo text,
  chave text not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'conciliado', 'ignorado')),
  ordem_id uuid references public.ordens_pagamento (id) on delete set null,
  comprovacao_id uuid references public.filiacao_recebe_comprovacao (id) on delete set null,
  automatico boolean not null default false,
  observacao text,
  conciliado_em timestamptz,
  conciliado_por uuid,
  created_at timestamptz not null default now(),
  unique (emp_proprietaria_id, chave)
);
create index if not exists banco_lancamentos_situacao_idx on public.banco_lancamentos (emp_proprietaria_id, situacao, data desc);
create index if not exists banco_lancamentos_ordem_idx on public.banco_lancamentos (ordem_id) where ordem_id is not null;
create index if not exists banco_lancamentos_comprovacao_idx on public.banco_lancamentos (comprovacao_id) where comprovacao_id is not null;

alter table public.banco_extratos enable row level security;
drop policy if exists tenant_isolation on public.banco_extratos;
create policy tenant_isolation on public.banco_extratos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.banco_extratos to authenticated;
drop trigger if exists set_emp_from_jwt on public.banco_extratos;
create trigger set_emp_from_jwt before insert on public.banco_extratos
  for each row execute function public.set_emp_from_jwt();

alter table public.banco_lancamentos enable row level security;
drop policy if exists tenant_isolation on public.banco_lancamentos;
create policy tenant_isolation on public.banco_lancamentos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.banco_lancamentos to authenticated;
drop trigger if exists set_emp_from_jwt on public.banco_lancamentos;
create trigger set_emp_from_jwt before insert on public.banco_lancamentos
  for each row execute function public.set_emp_from_jwt();

-- Trilha de auditoria (supabase/auditoria.sql), se a função existir.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_auditoria') then
    execute 'drop trigger if exists auditoria_registrar on public.banco_lancamentos';
    execute 'create trigger auditoria_registrar after update or delete on public.banco_lancamentos for each row execute function public.registrar_auditoria()';
  end if;
end $$;
