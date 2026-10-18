-- Confluir — Impressão digital do schema, para detectar deriva (Onda A3,
-- docs/plano-documentacao.md)
--
-- POR QUÊ: o schema só deve mudar por migração (supabase/migrations/). Uma
-- mudança feita no dashboard ou no SQL Editor não deixa rastro no repositório
-- e quebra a restauração do banco a partir dele. Sem Docker não há "shadow
-- database" para comparar, então comparamos o banco com uma impressão
-- registrada no repositório (supabase/schema-impressao.json).
--
-- COMO: `schema_impressao()` devolve um objeto { "<tipo>:<nome>": md5 } com a
-- definição de cada objeto que é nosso: tabelas (colunas, defaults, RLS),
-- privilégios, views, restrições, índices, policies (public e storage),
-- triggers, funções, enums, extensões e buckets. Quem compara:
--   - `npm run db:deriva` (local, via psql);
--   - o cron semanal /api/schema/deriva/tick (avisa no Sentry).
-- `npm run db:aplicar` regrava a impressão depois de aplicar migrações.
--
-- Só leitura de catálogo. SECURITY DEFINER para enxergar storage e pg_proc;
-- executável apenas por service_role.

create or replace function public.schema_impressao()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with objetos (chave, definicao) as (
    -- Tabelas: colunas (tipo, nulo, default) e RLS
    select 'tabela:' || c.relname,
           string_agg(
             a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod)
               || case when a.attnotnull then ' not null' else '' end
               || coalesce(' default ' || pg_catalog.pg_get_expr(d.adbin, d.adrelid), ''),
             ', ' order by a.attname
           ) || ' | rls=' || c.relrowsecurity::text || ' forcado=' || c.relforcerowsecurity::text
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relkind in ('r', 'p')
     group by c.relname, c.relrowsecurity, c.relforcerowsecurity

    union all
    -- Privilégios (grants a anon/authenticated/service_role)
    select 'privilegios:' || c.relname, coalesce(c.relacl::text, '')
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')

    union all
    -- Views e views materializadas
    select 'view:' || c.relname, pg_catalog.pg_get_viewdef(c.oid, true)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')

    union all
    -- Restrições (PK, FK, unique, check)
    select 'restricao:' || cl.relname || '.' || co.conname, pg_catalog.pg_get_constraintdef(co.oid)
      from pg_catalog.pg_constraint co
      join pg_catalog.pg_class cl on cl.oid = co.conrelid
      join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public'

    union all
    -- Índices
    select 'indice:' || i.indexname, i.indexdef
      from pg_catalog.pg_indexes i
     where i.schemaname = 'public'

    union all
    -- Policies de RLS (as nossas em storage também)
    select 'policy:' || p.schemaname || '.' || p.tablename || '.' || p.policyname,
           p.cmd || ' ' || p.permissive || ' ' || p.roles::text
             || ' using ' || coalesce(p.qual, '') || ' check ' || coalesce(p.with_check, '')
      from pg_catalog.pg_policies p
     where p.schemaname in ('public', 'storage')

    union all
    -- Triggers
    select 'trigger:' || c.relname || '.' || t.tgname, pg_catalog.pg_get_triggerdef(t.oid)
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal

    union all
    -- Funções e procedures (fora as de extensões), com quem pode executar
    select 'funcao:' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
           pg_catalog.pg_get_functiondef(p.oid) || ' | acl=' || coalesce(p.proacl::text, '')
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and not exists (
         select 1 from pg_catalog.pg_depend dep
          where dep.objid = p.oid and dep.deptype = 'e'
       )

    union all
    -- Enums
    select 'tipo:' || t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)
      from pg_catalog.pg_type t
      join pg_catalog.pg_namespace n on n.oid = t.typnamespace
      join pg_catalog.pg_enum e on e.enumtypid = t.oid
     where n.nspname = 'public'
     group by t.typname

    union all
    -- Extensões (o schema, não a versão: o Supabase atualiza versões sozinho)
    select 'extensao:' || e.extname, n.nspname
      from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n on n.oid = e.extnamespace

    union all
    -- Buckets do storage
    select 'bucket:' || b.id,
           b.public::text || ' ' || coalesce(b.file_size_limit::text, '') || ' ' || coalesce(b.allowed_mime_types::text, '')
      from storage.buckets b
  )
  select coalesce(pg_catalog.jsonb_object_agg(chave, pg_catalog.md5(coalesce(definicao, ''))), '{}'::jsonb)
    from objetos;
$$;

comment on function public.schema_impressao() is
  'Impressão digital do schema ({ "<tipo>:<nome>": md5 }) para detectar deriva em relação a supabase/schema-impressao.json (Onda A3).';

revoke all on function public.schema_impressao() from public, anon, authenticated;
grant execute on function public.schema_impressao() to service_role;
