-- Confluir — Privilégios exatos para a restauração reproduzir produção
-- (Onda A6, docs/plano-documentacao.md)
--
-- POR QUÊ: ao reconstruir o banco do zero (scripts/restaurar.mjs) num projeto
-- Supabase novo, 23 objetos saíram MAIS permissivos que em produção. Em
-- produção, funções sensíveis (analitica_*, mesclar_*, unificar_*,
-- anonimizar_filiacao, registrar_auditoria…) e algumas tabelas (auditoria,
-- fato_* etc.) tiveram EXECUTE/escrita retirados de anon e authenticated na
-- revisão de segurança. O pg_dump não emite essas revogações, porque o
-- Supabase concede tudo por privilégio padrão na criação. Além disso, dois
-- CHECKs de hospedagem_condicoes saíam com parênteses diferentes (mesmo
-- sentido), o que acusava deriva.
--
-- COMO: para cada um desses objetos, revoga tudo dos papéis da API e concede
-- de novo exatamente o que produção tem (gerado de aclexplode em produção em
-- 18/10/2026). Os dois CHECKs são recriados com o texto de produção. Em
-- produção não muda nada; num banco restaurado, fecha a diferença.
--
-- Também: schema_impressao() passa a ordenar as listas de privilégios antes
-- do hash. Os mesmos direitos em outra ordem (comum após GRANTs em sequência
-- diferente) não são deriva.

revoke all on table public.analitica_atualizacoes from public, anon, authenticated, service_role;
revoke all on table public.auditoria from public, anon, authenticated, service_role;
revoke all on table public.documento_assinatura_eventos from public, anon, authenticated, service_role;
revoke all on table public.fato_arrecadacao_mensal from public, anon, authenticated, service_role;
revoke all on table public.fato_despesa_mensal from public, anon, authenticated, service_role;
revoke all on table public.fato_filiacao_mensal from public, anon, authenticated, service_role;
revoke all on table public.fato_frota_mensal from public, anon, authenticated, service_role;
revoke all on table public.portal_push_assinaturas from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.analitica_atualizacoes to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.auditoria to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.documento_assinatura_eventos to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.documento_assinatura_eventos to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.fato_arrecadacao_mensal to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.fato_despesa_mensal to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.fato_filiacao_mensal to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.fato_frota_mensal to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.portal_push_assinaturas to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.portal_push_assinaturas to service_role;
grant INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.documento_assinatura_eventos to authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.auditoria to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.auditoria to authenticated;
revoke all on function public.analitica_arrecadacao(p_emp uuid, p_meses integer) from public, anon, authenticated, service_role;
revoke all on function public.analitica_atualizar() from public, anon, authenticated, service_role;
revoke all on function public.analitica_despesa(p_emp uuid, p_meses integer) from public, anon, authenticated, service_role;
revoke all on function public.analitica_filiacao(p_emp uuid, p_meses integer) from public, anon, authenticated, service_role;
revoke all on function public.analitica_frota(p_emp uuid, p_meses integer) from public, anon, authenticated, service_role;
revoke all on function public.analitica_situacao() from public, anon, authenticated, service_role;
revoke all on function public.anonimizar_filiacao(p_filiacao_id uuid, p_emp uuid) from public, anon, authenticated, service_role;
revoke all on function public.auth_diagnostico_token(p_token_hash text, p_email text) from public, anon, authenticated, service_role;
revoke all on function public.filiados_por_matricula_vinculo(p_emp uuid, p_termo text, p_limite integer) from public, anon, authenticated, service_role;
revoke all on function public.hospedagem_gravar_alocacao(p_emp uuid, p_hotel uuid, p_versao bigint, p_cupom uuid, p_quarto integer, p_sexo text, p_noites date[]) from public, anon, authenticated, service_role;
revoke all on function public.mesclar_filiacoes(p_emp uuid, p_principal uuid, p_secundarios uuid[], p_campos jsonb, p_usuario uuid) from public, anon, authenticated, service_role;
revoke all on function public.mesclar_fornecedores(p_emp uuid, p_principal uuid, p_secundarios uuid[], p_usuario uuid) from public, anon, authenticated, service_role;
revoke all on function public.registrar_auditoria() from public, anon, authenticated, service_role;
revoke all on function public.unificar_condutores(p_emp uuid, p_principal uuid, p_secundario uuid, p_autor uuid) from public, anon, authenticated, service_role;
revoke all on function public.unificar_usuarios(p_emp uuid, p_principal uuid, p_secundario uuid, p_autor uuid, p_simular boolean) from public, anon, authenticated, service_role;
grant execute on function public.analitica_arrecadacao(p_emp uuid, p_meses integer) to service_role;
grant execute on function public.analitica_atualizar() to service_role;
grant execute on function public.analitica_despesa(p_emp uuid, p_meses integer) to service_role;
grant execute on function public.analitica_filiacao(p_emp uuid, p_meses integer) to service_role;
grant execute on function public.analitica_frota(p_emp uuid, p_meses integer) to service_role;
grant execute on function public.analitica_situacao() to service_role;
grant execute on function public.anonimizar_filiacao(p_filiacao_id uuid, p_emp uuid) to service_role;
grant execute on function public.auth_diagnostico_token(p_token_hash text, p_email text) to service_role;
grant execute on function public.filiados_por_matricula_vinculo(p_emp uuid, p_termo text, p_limite integer) to service_role;
grant execute on function public.hospedagem_gravar_alocacao(p_emp uuid, p_hotel uuid, p_versao bigint, p_cupom uuid, p_quarto integer, p_sexo text, p_noites date[]) to service_role;
grant execute on function public.mesclar_filiacoes(p_emp uuid, p_principal uuid, p_secundarios uuid[], p_campos jsonb, p_usuario uuid) to service_role;
grant execute on function public.mesclar_fornecedores(p_emp uuid, p_principal uuid, p_secundarios uuid[], p_usuario uuid) to service_role;
grant execute on function public.registrar_auditoria() to service_role;
grant execute on function public.unificar_condutores(p_emp uuid, p_principal uuid, p_secundario uuid, p_autor uuid) to service_role;
grant execute on function public.unificar_usuarios(p_emp uuid, p_principal uuid, p_secundario uuid, p_autor uuid, p_simular boolean) to service_role;
alter table public.hospedagem_condicoes drop constraint if exists ck_hospedagem_condicoes_nc;
alter table public.hospedagem_condicoes add constraint ck_hospedagem_condicoes_nc CHECK ((((nao_comparecimento_quantidade >= 1) AND (nao_comparecimento_quantidade <= 50)) AND ((nao_comparecimento_janela_meses >= 1) AND (nao_comparecimento_janela_meses <= 60)) AND (nao_comparecimento_penalidade = ANY (ARRAY['consumir_periodo'::text, 'suspender'::text, 'desabilitar'::text])) AND (nao_comparecimento_periodo = ANY (ARRAY['mes'::text, 'ano'::text])) AND ((nao_comparecimento_suspensao_dias >= 1) AND (nao_comparecimento_suspensao_dias <= 730)))) NOT VALID;
alter table public.hospedagem_condicoes drop constraint if exists ck_hospedagem_condicoes_qtd;
alter table public.hospedagem_condicoes add constraint ck_hospedagem_condicoes_qtd CHECK ((((quantidade_maxima >= 1) AND (quantidade_maxima <= 365)) AND (quantidade_periodo = ANY (ARRAY['mes'::text, 'ano'::text])))) NOT VALID;

-- schema_impressao(): ACL ordenada ------------------------------------------------
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
    select 'privilegios:' || c.relname, coalesce((select string_agg(x::text, ',' order by x::text) from unnest(c.relacl) x), '')
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
           pg_catalog.pg_get_functiondef(p.oid) || ' | acl=' || coalesce((select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x), '')
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
  'Impressão digital do schema ({ "<tipo>:<nome>": md5 }) para detectar deriva em relação a supabase/schema-impressao.json (Onda A3). Listas de privilégios ordenadas: a ordem das entradas não conta (A6).';

revoke all on function public.schema_impressao() from public, anon, authenticated;
grant execute on function public.schema_impressao() to service_role;
