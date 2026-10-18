-- Confluir — Trilha de auditoria genérica (2026-10-03, onda 1 / S9)
--
-- POR QUÊ: alterações em permissões, perfis, usuários, filiações, dados
-- bancários, fornecedores, ordens e contratos não deixavam rastro de QUEM
-- mudou O QUÊ. Só algumas áreas tinham trilha própria (ordens, ofícios…).
--
-- COMO: um trigger AFTER em cada tabela sensível grava em `auditoria` a
-- operação, os campos alterados (só eles, no UPDATE), o antes e o depois, e
-- quem agiu. O "quem" vem do cabeçalho `x-confluir-usuario`, que o
-- createAdminClient() envia em toda requisição do painel (lib/sessao-atual.ts);
-- o PostgREST expõe os cabeçalhos em `request.headers`. Sem cabeçalho (cron,
-- fluxo público, script) o registro fica sem usuário, mas com o papel do JWT.
--
-- A função NUNCA derruba a operação de negócio: qualquer erro vira warning.
-- Colunas sigilosas (cifradas) saem como "[oculto]"; carimbos de data são
-- ignorados na detecção de mudança.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- 1. Tabela ----------------------------------------------------------------
create table if not exists public.auditoria (
  id                  bigserial primary key,
  emp_proprietaria_id uuid,
  tabela              text not null,
  registro_id         text,
  operacao            text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  campos              text[],
  antes               jsonb,
  depois              jsonb,
  usuario_id          uuid,          -- usuarios.id de quem agiu (cabeçalho)
  papel               text,          -- role do JWT: authenticated | service_role | anon
  momento             timestamptz not null default now()
);
comment on table public.auditoria is
  'Trilha genérica: quem alterou o quê nas tabelas sensíveis (trigger registrar_auditoria).';

create index if not exists auditoria_emp_momento_idx
  on public.auditoria (emp_proprietaria_id, momento desc);
create index if not exists auditoria_registro_idx
  on public.auditoria (emp_proprietaria_id, tabela, registro_id, momento desc);
create index if not exists auditoria_usuario_idx
  on public.auditoria (emp_proprietaria_id, usuario_id, momento desc);

-- Leitura pelo cliente do tenant; escrita só pelo trigger (security definer).
alter table public.auditoria enable row level security;
drop policy if exists tenant_isolation on public.auditoria;
create policy tenant_isolation on public.auditoria for select to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select on public.auditoria to authenticated;
revoke insert, update, delete on public.auditoria from authenticated, anon;

-- 2. Permissão de leitura da trilha ----------------------------------------
alter table public.permissoes add column if not exists institucional_auditoria boolean;

-- 3. Função do trigger -----------------------------------------------------
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_antes   jsonb;
  v_depois  jsonb;
  v_campos  text[];
  v_emp     uuid;
  v_id      text;
  v_usuario uuid;
  v_papel   text;
  v_hdr     jsonb;
  v_claims  jsonb;
  k         text;
  ignorar   constant text[] := array['updated_at', 'modified_at', 'atualizado_em', 'created_at', 'criado_em'];
  ocultar   constant text[] := array['senha', 'nome_retido_cifrado', 'cpf_retido_cifrado', 'relatorio_cifrado', 'codigo_hash', 'comprovante_hash'];
begin
  if tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
  else
    v_depois := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    select coalesce(array_agg(d.key), '{}')
      into v_campos
      from jsonb_each(v_depois) d
     where d.value is distinct from (v_antes -> d.key)
       and not (d.key = any (ignorar));
    if coalesce(array_length(v_campos, 1), 0) = 0 then
      return null;  -- só carimbo mudou: não é alteração de negócio
    end if;
    -- Guarda só os campos que mudaram.
    v_antes  := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(v_antes)  e where e.key = any (v_campos));
    v_depois := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(v_depois) e where e.key = any (v_campos));
  end if;

  foreach k in array ocultar loop
    if v_antes  ? k then v_antes  := jsonb_set(v_antes,  array[k], '"[oculto]"'::jsonb); end if;
    if v_depois ? k then v_depois := jsonb_set(v_depois, array[k], '"[oculto]"'::jsonb); end if;
  end loop;

  v_id  := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id');
  begin
    v_emp := nullif(coalesce(to_jsonb(new) ->> 'emp_proprietaria_id', to_jsonb(old) ->> 'emp_proprietaria_id'), '')::uuid;
  exception when others then
    v_emp := null;
  end;
  if v_emp is null and tg_table_name = 'empresa' then
    begin v_emp := v_id::uuid; exception when others then v_emp := null; end;
  end if;

  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::jsonb;
    v_usuario := nullif(v_hdr ->> 'x-confluir-usuario', '')::uuid;
  exception when others then
    v_usuario := null;
  end;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_papel := v_claims ->> 'role';
  exception when others then
    v_papel := null;
  end;

  insert into public.auditoria (emp_proprietaria_id, tabela, registro_id, operacao, campos, antes, depois, usuario_id, papel)
  values (v_emp, tg_table_name, v_id, tg_op, v_campos, v_antes, v_depois, v_usuario, v_papel);
  return null;
exception when others then
  raise warning 'auditoria: falha em % (%): %', tg_table_name, tg_op, sqlerrm;
  return null;
end;
$fn$;

revoke all on function public.registrar_auditoria() from public, anon, authenticated;

-- 4. Instala o trigger nas tabelas sensíveis que existirem ------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'permissoes', 'perfis', 'perfil_permissoes', 'usuario_perfis', 'usuarios',
    'filiacoes', 'filiacao_vinculos', 'dados_bancarios',
    'fornecedores', 'compras_fornecedores',
    'ordens_pagamento', 'contratos', 'auth_identidades',
    'cessao_espacos', 'financeiro_config', 'caixa_contas', 'empresa', 'plataforma_admins'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists auditoria_registrar on public.%I', t);
    execute format(
      'create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()',
      t
    );
  end loop;
end $$;

-- 5. Conferência -----------------------------------------------------------
-- select tgrelid::regclass, tgname from pg_trigger where tgname = 'auditoria_registrar';
-- update usuarios set nome_guerra = nome_guerra where id = '<algum id>';  -- não gera linha (nada mudou)
-- select tabela, operacao, campos, usuario_id, papel, momento from auditoria order by id desc limit 5;
