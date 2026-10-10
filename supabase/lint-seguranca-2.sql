-- ===========================================================================
-- Remediação dos avisos do Database Linter do Supabase (10/10/2026)
-- ===========================================================================
-- Cinco WARNs de SECURITY. Idempotente; roda numa transação só porque, entre
-- mover o unaccent e recriar o f_unaccent, as colunas geradas ficariam sem a
-- função (INSERT em filiacoes falharia).
-- Executar UMA VEZ no SQL Editor do Supabase.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) WARN — Extension in Public: pg_trgm e unaccent → schema `extensions`
-- ---------------------------------------------------------------------------
-- Os índices gin_trgm_ops apontam o opclass por OID: seguem funcionando. O
-- dicionário `unaccent` vai junto com a extensão. `extensions` já está no
-- search_path do PostgREST/authenticated no Supabase.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
alter extension unaccent set schema extensions;

-- ---------------------------------------------------------------------------
-- 2) WARN — Function Search Path Mutable: f_unaccent
-- ---------------------------------------------------------------------------
-- O corpo antigo chamava public.unaccent('public.unaccent', ...) — quebraria
-- com o passo 1. Agora tudo qualificado e search_path vazio. Mesmo resultado,
-- então as colunas geradas (nome_completo_norm) não precisam ser recalculadas.
create or replace function public.f_unaccent(text)
  returns text
  language sql
  immutable
  parallel safe
  strict
  set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- ---------------------------------------------------------------------------
-- 3) WARN — Function Search Path Mutable: filiacoes_nascimento_dia_mes
-- ---------------------------------------------------------------------------
-- O corpo só usa extract() (pg_catalog, sempre visível): search_path vazio.
alter function public.filiacoes_nascimento_dia_mes() set search_path = '';

-- ---------------------------------------------------------------------------
-- 4) WARN — RLS Policy Always True: documento_assinatura_eventos
-- ---------------------------------------------------------------------------
-- Regressão do assinatura-generalizada.sql: ao re-declarar as policies depois
-- do rename, trilha_leitura e trilha_insercao viraram `true`. Em
-- oficios-assinatura.sql elas eram por tenant. O linter só acusa o INSERT,
-- mas o SELECT `using (true)` é pior: o JWT de um tenant lê a trilha (IP,
-- user agent) das assinaturas de outro.
--
-- A gravação passa pelo cliente do tenant (TABELAS_TENANT) e o trigger
-- set_emp_from_jwt preenche o emp. Antes de fechar a leitura, completa o emp
-- de algum evento que tenha ficado sem ele, a partir do envelope.
update public.documento_assinatura_eventos e
   set emp_proprietaria_id = a.emp_proprietaria_id
  from public.documento_assinaturas a
 where a.id = e.assinatura_id
   and e.emp_proprietaria_id is null;

drop policy if exists trilha_leitura on public.documento_assinatura_eventos;
create policy trilha_leitura on public.documento_assinatura_eventos
  for select to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);

drop policy if exists trilha_insercao on public.documento_assinatura_eventos;
create policy trilha_insercao on public.documento_assinatura_eventos
  for insert to authenticated
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);

revoke update, delete on public.documento_assinatura_eventos from authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Conferência (rodar depois; tudo deve vir vazio / zero)
-- ---------------------------------------------------------------------------
-- select extname, extnamespace::regnamespace from pg_extension
--  where extname in ('pg_trgm', 'unaccent');                -- → extensions
-- select public.f_unaccent('Conceição');                    -- → Conceicao
-- select count(*) from public.documento_assinatura_eventos
--  where emp_proprietaria_id is null;                         -- → 0
