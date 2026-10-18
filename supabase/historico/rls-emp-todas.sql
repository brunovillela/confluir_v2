-- Confluir — corrige o backstop RLS para TODAS as tabelas com emp (2026-07-25)
--
-- PROBLEMA: rls-tenant-isolation.sql aplicou a política `tenant_isolation` a uma
-- LISTA FIXA de 109 tabelas. Tabelas tenant-owned criadas DEPOIS (diarias.sql,
-- reembolsos-act.sql, veiculos.sql, hospedagem-faturamento.sql) nasceram com o
-- padrão antigo "RLS deny-all" (RLS ligado, SEM policy). Como agora a LEITURA
-- passa pelo JWT do tenant (papel authenticated), deny-all faz a leitura
-- retornar ZERO linhas → os módulos aparecem vazios.
--
-- SOLUÇÃO: em vez de lista fixa, percorre TODA tabela do schema public que TEM
-- a coluna emp_proprietaria_id e garante a política + grant + trigger. É
-- idempotente e AUTO-CURA qualquer tabela emp futura (rodar de novo se criar
-- outra). Depende de public.set_emp_from_jwt() (de rls-escrita-tenant.sql).
--
-- Tabelas sem emp que o app lê e que ficaram deny-all: ganham emp aqui e
-- entram no fluxo uniforme. `centros_de_custo` (plano de contas) é POR TENANT
-- ("cada organização tem sua composição de centros de custo") — só faltava a
-- coluna; backfill pelo departamento (pai com emp) e o resto pelo tenant atual.
-- setup-fase-3a.sql ligou RLS em TODAS as tabelas do schema; sem policy isso
-- vira deny-all e a leitura pelo JWT do tenant zera — este script corrige.

-- 1. Tabelas-filhas/globais que passam a ter emp próprio ----------------------
alter table veiculos_infracoes_historico
  add column if not exists emp_proprietaria_id uuid references empresa(id);
update veiculos_infracoes_historico h
  set emp_proprietaria_id = v.emp_proprietaria_id
  from veiculos_infracoes vi
  join veiculos v on v.id = vi.veiculo_id
  where vi.id = h.infracao_id and h.emp_proprietaria_id is null;

alter table hospedagem_hotel_contas
  add column if not exists emp_proprietaria_id uuid references empresa(id);
update hospedagem_hotel_contas c
  set emp_proprietaria_id = h.emp_proprietaria_id
  from hospedagem_hotel h
  where h.id = c.hotel_id and c.emp_proprietaria_id is null;

-- centros_de_custo (plano de contas por tenant): backfill pelo departamento e,
-- para os sem departamento, pelo tenant atual (registro único em `tenants`).
alter table centros_de_custo
  add column if not exists emp_proprietaria_id uuid references empresa(id);
update centros_de_custo c
  set emp_proprietaria_id = ed.emp_proprietaria_id
  from empresa_departamentos ed
  where ed.id = c.departamento_id and c.emp_proprietaria_id is null;
update centros_de_custo
  set emp_proprietaria_id = (select empresa_id from tenants order by created_at limit 1)
  where emp_proprietaria_id is null;

-- 2. Política data-driven sobre TODA tabela com emp_proprietaria_id -----------
do $$
declare
  claim constant text := $q$(auth.jwt() ->> 'tenant_id')::uuid$q$;
  t text;
  cond text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'emp_proprietaria_id'
      and tb.table_type = 'BASE TABLE'
      and c.table_name not in ('tenants', 'plataforma_admins')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    -- `empresa`: a própria organização tem emp nulo e id = tenant.
    if t = 'empresa' then
      cond := format('(emp_proprietaria_id = %s or id = %s)', claim, claim);
    else
      cond := format('(emp_proprietaria_id = %s)', claim);
    end if;
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated using %s with check %s',
      t, cond, cond
    );
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format(
      'create trigger set_emp_from_jwt before insert on public.%I '
      || 'for each row execute function public.set_emp_from_jwt()',
      t
    );
  end loop;
end $$;
