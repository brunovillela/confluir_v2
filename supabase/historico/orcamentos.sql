-- Confluir — Orçamento por centro de custo (2026-10-04, onda 3 / I3)
--
-- Valor anual previsto por centro de custo, para o "orçado × realizado" do
-- Financeiro gerencial (/painel/financeiro/gerencial). O realizado vem da
-- camada analítica (fato_despesa_mensal, supabase/analitica.sql).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.financeiro_orcamentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  ano int not null check (ano between 2000 and 2100),
  centro_custo_id uuid not null references public.centros_de_custo (id) on delete cascade,
  valor_anual numeric(14,2) not null check (valor_anual >= 0),
  observacao text,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (emp_proprietaria_id, ano, centro_custo_id)
);
create index if not exists financeiro_orcamentos_emp_ano_idx on public.financeiro_orcamentos (emp_proprietaria_id, ano);

alter table public.financeiro_orcamentos enable row level security;
drop policy if exists tenant_isolation on public.financeiro_orcamentos;
create policy tenant_isolation on public.financeiro_orcamentos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.financeiro_orcamentos to authenticated;
drop trigger if exists set_emp_from_jwt on public.financeiro_orcamentos;
create trigger set_emp_from_jwt before insert on public.financeiro_orcamentos
  for each row execute function public.set_emp_from_jwt();

-- Trilha de auditoria (supabase/auditoria.sql), se a função existir.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_auditoria') then
    execute 'drop trigger if exists auditoria_registrar on public.financeiro_orcamentos';
    execute 'create trigger auditoria_registrar after insert or update or delete on public.financeiro_orcamentos for each row execute function public.registrar_auditoria()';
  end if;
end $$;
