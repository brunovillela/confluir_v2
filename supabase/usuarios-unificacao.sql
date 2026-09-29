-- Confluir — Unificação de contas de usuário da mesma pessoa (2026-09-29)
--
-- A mesma pessoa com DOIS usuários (e-mail institucional e pessoal, herança do
-- Bubble). unificar_usuarios() junta o secundário no principal, numa transação:
--
-- 1. Tudo que aponta para o secundário passa para o principal: as colunas com
--    chave estrangeira para usuarios(id) — descobertas no catálogo, ~200 — e
--    as colunas sem chave declarada que guardam usuário (Hospedagem). Ficam de
--    fora os registros que DOCUMENTAM unificações (apontam de propósito para o
--    secundário). Se mover uma tabela bater em chave única (ex.: a mesma pessoa
--    duas vezes no mesmo grupo), aquela tabela fica como estava e vai para
--    "pendentes" no relatório — o resto segue.
-- 2. Contatos (e-mails, telefones, endereços) idênticos que ficaram repetidos
--    no principal viram um só.
-- 3. Campos vazios do principal são completados com os do secundário (CPF,
--    nascimento, foto, sexo, estado civil…); autorização de CNH e "filiado"
--    valem se qualquer um tinha.
-- 4. O secundário NÃO é apagado: fica inativo e excluído, apontando para o
--    principal (unificado_em_id). Tudo o que mudou fica em usuarios_unificacoes.
--
-- p_simular = true faz tudo, monta o relatório e DESFAZ — para conferir antes.
-- Recusa se as duas contas têm login (auth) — escolher antes qual login fica.
--
-- Executar UMA VEZ no SQL Editor do Supabase.

alter table usuarios add column if not exists unificado_em_id uuid references usuarios(id);
alter table usuarios add column if not exists unificado_em timestamptz;
comment on column usuarios.unificado_em_id is
  'Conta que incorporou esta (mesma pessoa com dois usuários). Esta fica inativa e excluída; o que apontava para ela foi movido.';

create table if not exists usuarios_unificacoes (id uuid primary key default gen_random_uuid());
alter table usuarios_unificacoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table usuarios_unificacoes add column if not exists principal_usuario_id uuid references usuarios(id);
alter table usuarios_unificacoes add column if not exists secundario_usuario_id uuid references usuarios(id);
alter table usuarios_unificacoes add column if not exists principal_antes jsonb;
alter table usuarios_unificacoes add column if not exists secundario_antes jsonb;
alter table usuarios_unificacoes add column if not exists movidos jsonb;     -- { "tabela.coluna": [ids] }
alter table usuarios_unificacoes add column if not exists pendentes jsonb;   -- [ { tabela, coluna, erro } ]
alter table usuarios_unificacoes add column if not exists contatos_removidos jsonb;
alter table usuarios_unificacoes add column if not exists feito_por_id uuid references usuarios(id);
alter table usuarios_unificacoes add column if not exists created_at timestamptz not null default now();

alter table usuarios_unificacoes enable row level security;
drop policy if exists tenant_isolation on usuarios_unificacoes;
create policy tenant_isolation on usuarios_unificacoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on usuarios_unificacoes to authenticated;
drop trigger if exists set_emp_from_jwt on usuarios_unificacoes;
create trigger set_emp_from_jwt before insert on usuarios_unificacoes
  for each row execute function public.set_emp_from_jwt();

create or replace function public.unificar_usuarios(
  p_emp uuid,
  p_principal uuid,
  p_secundario uuid,
  p_autor uuid,
  p_simular boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  up usuarios%rowtype;
  us usuarios%rowtype;
  ref record;
  v_ids jsonb;
  v_movidos jsonb := '{}'::jsonb;
  v_pendentes jsonb := '[]'::jsonb;
  v_contatos jsonb := '[]'::jsonb;
  v_removidos jsonb;
  v_campos text[] := array[
    'cpf', 'cpf_arquivo', 'foto', 'data_nascimento', 'nascimento_dia', 'nascimento_mes',
    'nascimento_data', 'sexo', 'estado_civil', 'escolaridade', 'whatsapp', 'email_empresa',
    'empresa_matricula', 'vinculo_instituicao', 'vinculo_instituicao_os', 'sindicato_id'
  ];
  v_completados text[] := '{}';
  campo text;
  v_relatorio jsonb;
begin
  if p_principal = p_secundario then
    raise exception 'Escolha duas contas diferentes.';
  end if;
  select * into up from usuarios where id = p_principal and emp_proprietaria_id = p_emp;
  select * into us from usuarios where id = p_secundario and emp_proprietaria_id = p_emp;
  if up.id is null or us.id is null then
    raise exception 'Contas não encontradas neste tenant.';
  end if;
  if us.unificado_em_id is not null then
    raise exception 'A conta % já foi unificada em outra.', coalesce(us.email, us.id::text);
  end if;
  if up.auth_user_id is not null and us.auth_user_id is not null then
    raise exception 'As duas contas têm login. Decida antes qual login fica.';
  end if;
  if us.auth_user_id is not null then
    raise exception 'A conta que sai tem login e a que fica não. Escolha como principal a conta com login.';
  end if;

  begin
    -- 1. Referências
    for ref in
      select cl.relname::text as tabela, att.attname::text as coluna
        from pg_constraint con
        join pg_class cl on cl.oid = con.conrelid
        join pg_namespace ns on ns.oid = cl.relnamespace
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
       where con.contype = 'f'
         and con.confrelid = 'public.usuarios'::regclass
         and array_length(con.conkey, 1) = 1
         and ns.nspname = 'public'
         -- Registros que documentam unificações apontam de propósito para o secundário.
         and not (cl.relname in ('usuarios_unificacoes', 'veiculos_condutores_unificacoes'))
         and not (cl.relname = 'veiculos_condutores_cnh' and att.attname = 'usuario_origem_id')
         and not (cl.relname = 'usuarios' and att.attname = 'unificado_em_id')
      union
      -- Colunas sem chave declarada que guardam usuário.
      select c.table_name::text, c.column_name::text
        from information_schema.columns c
       where c.table_schema = 'public'
         and (c.table_name, c.column_name) in (
           ('hospedagem_quartos_noite', 'anotado_por'),
           ('hospedagem_cupom', 'presenca_por'),
           ('hospedagem_cupom', 'nao_comparecimento_abonado_por')
         )
    loop
      begin
        execute format(
          'with m as (update %I set %I = $1 where %I = $2 returning 1) select to_jsonb(count(*)) from m',
          ref.tabela, ref.coluna, ref.coluna
        ) using p_principal, p_secundario into v_ids;
        if (v_ids)::int > 0 then
          v_movidos := v_movidos || jsonb_build_object(ref.tabela || '.' || ref.coluna, v_ids);
        end if;
      exception when unique_violation or foreign_key_violation or check_violation then
        v_pendentes := v_pendentes || jsonb_build_object('tabela', ref.tabela, 'coluna', ref.coluna, 'erro', sqlerrm);
      end;
    end loop;

    -- 2. Contatos idênticos que ficaram repetidos no principal
    begin
      with dup as (
        select id, row_number() over (
                 partition by lower(btrim(email)) order by favorito desc nulls last, created_at, id) as n
          from emails where usuario_id = p_principal and email is not null
      ), del as (delete from emails where id in (select id from dup where n > 1) returning to_jsonb(emails.*) as r)
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v_removidos from del;
      v_contatos := v_contatos || v_removidos;
    exception when foreign_key_violation then null;
    end;
    begin
      with dup as (
        select id, row_number() over (
                 partition by regexp_replace(numero, '\D', '', 'g') order by favorito desc nulls last, created_at, id) as n
          from telefones where usuario_id = p_principal and numero is not null
      ), del as (delete from telefones where id in (select id from dup where n > 1) returning to_jsonb(telefones.*) as r)
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v_removidos from del;
      v_contatos := v_contatos || v_removidos;
    exception when foreign_key_violation then null;
    end;
    begin
      with dup as (
        select id, row_number() over (
                 partition by regexp_replace(coalesce(cep, ''), '\D', '', 'g'), lower(btrim(coalesce(numero, ''))),
                              lower(btrim(coalesce(logradouro, '')))
                 order by favorito desc nulls last, (complemento is null), created_at, id) as n
          from enderecos where usuario_id = p_principal
      ), del as (delete from enderecos where id in (select id from dup where n > 1) returning to_jsonb(enderecos.*) as r)
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v_removidos from del;
      v_contatos := v_contatos || v_removidos;
    exception when foreign_key_violation then null;
    end;

    -- 3. Campos vazios do principal completados pelo secundário
    foreach campo in array v_campos loop
      if (to_jsonb(up) -> campo) is not null and (to_jsonb(up) ->> campo) is null
         and (to_jsonb(us) ->> campo) is not null then
        execute format(
          'update usuarios set %I = (select %I from usuarios where id = $2) where id = $1', campo, campo
        ) using p_principal, p_secundario;
        v_completados := v_completados || campo;
      end if;
    end loop;
    update usuarios set
      cnh_autorizado = coalesce(up.cnh_autorizado, false) or coalesce(us.cnh_autorizado, false),
      filiado = coalesce(up.filiado, false) or coalesce(us.filiado, false),
      updated_at = now()
    where id = p_principal;

    -- 4. O secundário sai (sem apagar)
    update usuarios set
      inativo = true,
      deletado = true,
      unificado_em_id = p_principal,
      unificado_em = now(),
      updated_at = now()
    where id = p_secundario;

    insert into usuarios_unificacoes (emp_proprietaria_id, principal_usuario_id, secundario_usuario_id,
      principal_antes, secundario_antes, movidos, pendentes, contatos_removidos, feito_por_id)
    values (p_emp, p_principal, p_secundario, to_jsonb(up), to_jsonb(us), v_movidos, v_pendentes, v_contatos, p_autor);

    v_relatorio := jsonb_build_object(
      'simulado', p_simular,
      'movidos', v_movidos,
      'pendentes', v_pendentes,
      'contatos_removidos', jsonb_array_length(v_contatos),
      'campos_completados', to_jsonb(v_completados)
    );
    if p_simular then
      raise exception 'SIMULACAO_CONFLUIR';
    end if;
  exception when others then
    if sqlerrm = 'SIMULACAO_CONFLUIR' then
      return v_relatorio;   -- tudo acima foi desfeito
    end if;
    raise;
  end;
  return v_relatorio;
end $$;

-- Só o servidor (service role) chama.
revoke all on function public.unificar_usuarios(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.unificar_usuarios(uuid, uuid, uuid, uuid, boolean) to service_role;
