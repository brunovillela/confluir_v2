-- Confluir — remove policies PERMISSIVAS LEGADAS que furam o backstop (2026-08-25)
--
-- ACHADO (auditoria de bloqueio de tenant): 3 tabelas — `usuarios`,
-- `filiacoes` e `empresa` — deixavam o papel `authenticated` LER linhas de
-- QUALQUER tenant, apesar de terem a política `tenant_isolation` (emp = claim).
-- Causa: sobreviveu nelas uma policy antiga e permissiva (estilo `using(true)`,
-- provavelmente default do Supabase ou resquício da migração do Bubble, criada
-- fora do controle de versão). Como POLICIES SÃO OR, a permissiva anula a
-- isolação. rls-emp-todas.sql só fazia `drop policy if exists tenant_isolation`
-- (um nome só) → não removia a legada.
--
-- Impacto: NÃO explorável externamente (anon é negado; forjar o JWT exige o
-- SUPABASE_JWT_SECRET, que é server-side). É uma falha do BACKSTOP de defesa em
-- profundidade — se uma query esquecesse o filtro emp nessas 3 tabelas (as mais
-- sensíveis: CPF, 40/49 colunas), o banco não barraria. Escrita já estava
-- correta (WITH CHECK bloqueia); só a leitura vazava.
--
-- CORREÇÃO (data-driven, idempotente, auto-cura): em TODA tabela do schema
-- public com emp_proprietaria_id, dropa qualquer policy que NÃO seja
-- `tenant_isolation`/`tenant_isolation_pai` e garante que a `tenant_isolation`
-- exista. Rode UMA VEZ no SQL Editor do Supabase. Depois, o sweep de auditoria
-- (scripts) deve acusar ZERO tabelas vazando.

do $$
declare
  claim constant text := $q$(auth.jwt() ->> 'tenant_id')::uuid$q$;
  r record;
  cond text;
begin
  for r in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'emp_proprietaria_id'
      and tb.table_type = 'BASE TABLE'
      and c.table_name not in ('tenants', 'plataforma_admins')
  loop
    -- 1. Remove QUALQUER policy legada (nome diferente das nossas duas).
    declare p record;
    begin
      for p in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = r.table_name
          and policyname not in ('tenant_isolation', 'tenant_isolation_pai')
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, r.table_name);
        raise notice 'removida policy legada % em %', p.policyname, r.table_name;
      end loop;
    end;

    -- 2. Garante RLS ligado e a tenant_isolation (recria por segurança).
    execute format('alter table public.%I enable row level security', r.table_name);
    if r.table_name = 'empresa' then
      cond := format('(emp_proprietaria_id = %s or id = %s)', claim, claim);
    else
      cond := format('(emp_proprietaria_id = %s)', claim);
    end if;
    execute format('drop policy if exists tenant_isolation on public.%I', r.table_name);
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated using %s with check %s',
      r.table_name, cond, cond
    );
  end loop;
end $$;

-- Verificação rápida (deve retornar só tenant_isolation/_pai por tabela):
--   select tablename, policyname from pg_policies
--   where schemaname='public' and tablename in ('usuarios','filiacoes','empresa')
--   order by 1,2;
