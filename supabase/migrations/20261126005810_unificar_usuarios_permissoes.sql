-- unificar_usuarios: uma linha de permissões por pessoa (25/11/2026).
--
-- POR QUÊ: a função movia a linha de `permissoes` do cadastro que sai para
-- o que fica. Quando as duas contas tinham acesso, a pessoa ficava com duas
-- linhas, e o login (src/lib/auth.ts lê uma só, com maybeSingle) deixava de
-- funcionar. Foi preciso apagar à mão antes de unificar seis diretores.
--
-- O QUE MUDA: antes de mover as referências, se as duas contas têm linha de
-- permissões, as chaves ligadas em qualquer uma ficam ligadas no principal
-- (com a maior alçada), os departamentos de compras passam para ele e a linha
-- do secundário sai (cópia em movidos."permissoes.secundario_antes"). Perfis
-- repetidos do secundário saem antes da troca de dono. O relatório ganha
-- "permissoes_unidas", que o painel usa para saber que esta versão está no ar.
-- O resto da função é o mesmo da linha de base. CREATE OR REPLACE preserva os
-- privilégios (só service_role executa).

create or replace function public.unificar_usuarios(p_emp uuid, p_principal uuid, p_secundario uuid, p_autor uuid, p_simular boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
  pp permissoes%rowtype;
  ps permissoes%rowtype;
  v_set text;
  v_perm_unidas boolean := false;
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
    -- 0. Permissões: uma linha só por pessoa (o login lê uma única linha;
    --    duas derrubam a sessão). Se as duas contas têm acesso, as chaves
    --    ligadas em qualquer uma ficam ligadas no principal, os departamentos
    --    de compras passam para ele e a linha do secundário sai.
    select * into pp from permissoes where usuario_id = p_principal limit 1;
    select * into ps from permissoes where usuario_id = p_secundario limit 1;
    if pp.id is not null and ps.id is not null then
      select string_agg(format('%1$I = coalesce(p.%1$I, false) or coalesce(s.%1$I, false)', c.column_name), ', ')
        into v_set
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'permissoes' and c.data_type = 'boolean';
      if v_set is not null then
        execute format('update permissoes p set %s from permissoes s where p.id = $1 and s.id = $2', v_set)
          using pp.id, ps.id;
      end if;
      -- Alçada de aprovação: fica a maior das duas.
      if ps.alcada_aprovacao is not null then
        update permissoes set alcada_aprovacao = greatest(pp.alcada_aprovacao, ps.alcada_aprovacao)
         where id = pp.id;
      end if;
      insert into permissoes_compras_depto (permissao_id, departamento_id)
        select pp.id, d.departamento_id from permissoes_compras_depto d where d.permissao_id = ps.id
        on conflict do nothing;
      delete from permissoes where id = ps.id;
      v_movidos := v_movidos || jsonb_build_object('permissoes.secundario_antes', to_jsonb(ps));
      v_perm_unidas := true;
    end if;
    -- Perfis que as duas contas já têm: o do secundário sai (senão a troca
    -- de dono esbarra no único (usuario_id, perfil_id)).
    delete from usuario_perfis s
     where s.usuario_id = p_secundario
       and exists (select 1 from usuario_perfis p where p.usuario_id = p_principal and p.perfil_id = s.perfil_id);

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
      'permissoes_unidas', v_perm_unidas,
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
end $_$;
