-- Confluir — mesclagem de cadastros lado a lado: união de contatos e de vínculos
--
-- POR QUÊ: a tela de mesclar passa a abrir os cadastros inteiros, um ao lado do
-- outro, e a pessoa decide o que fica. Só escolher "um valor por campo" perdia
-- informação: o telefone não escolhido sumia, e os vínculos eram unificados por
-- uma regra automática que a pessoa não via nem podia corrigir. Três falhas
-- antigas caem junto:
--  - a forma de recebimento, o valor próprio da contribuição e as datas da
--    condição não podiam ser escolhidos;
--  - o WhatsApp do telefone e a data de aceite dos termos não vinham com o valor;
--  - o login (usuario_id) e o pedido para não receber a mala direta (LGPD) do
--    cadastro incorporado se perdiam.
--
-- COMO: `mesclar_filiacoes` ganha dois parâmetros opcionais, com padrão NULL (a
-- chamada antiga, de 5 argumentos, continua valendo e segue a regra automática):
--  - p_vinculos: [{fica, sai}] — os pares que a pessoa decidiu unir. Só vínculos
--    de cadastros diferentes e da mesma fonte; outro par é recusado. Com a lista
--    (mesmo vazia), a regra automática não roda;
--  - p_contatos: o que fazer com os contatos — os e-mails, telefones e endereços
--    que vão para "Outros contatos", os que a pessoa descartou, os contatos de
--    emergência descartados, as contas iguais a unir e a conta principal.
-- Quem é descartado continua no cadastro incorporado (ele fica excluído, não é
-- apagado) e é citado no prontuário.

drop function if exists public.mesclar_filiacoes(uuid, uuid, uuid[], jsonb, uuid);

create or replace function public.mesclar_filiacoes(
  p_emp uuid,
  p_principal uuid,
  p_secundarios uuid[],
  p_campos jsonb,
  p_usuario uuid,
  p_vinculos jsonb default null,
  p_contatos jsonb default null
) returns jsonb
language plpgsql
set search_path to 'public'
as $_$
declare
  -- Campos do cadastro que a tela deixa escolher entre os duplicados.
  permitidos text[] := array[
    'nome_completo', 'nome_social', 'cpf', 'matricula_sindical', 'sexo', 'nascimento_data',
    'email_pessoal', 'email_corporativo', 'telefone_1', 'telefone_1_whatsapp', 'telefone_2',
    'telefone_2_whatsapp', 'endereco_cep', 'endereco_logradouro', 'endereco_numero',
    'endereco_complemento', 'endereco_bairro', 'endereco_cidade', 'endereco_estado',
    'filiacao_condicao', 'tl_lgpd_id', 'tl_lgpd_data', 'tl_desconto_id', 'tl_desconto_data',
    'foto', 'recebe_mensagens',
    'forma_recebimento', 'forma_recebimento_ordem', 'contribuicao_valor',
    'condicao_desde', 'ficha_assinada_em', 'filiacao_informada_fonte_em', 'ativo_em',
    'desfiliacao_informada_fonte_em', 'inativo_em'
  ];
  ref record;
  campo text;
  n integer;
  movidos jsonb := '{}'::jsonb;
  pendentes jsonb := '[]'::jsonb;
  nomes text;
  todos uuid[] := array[p_principal] || p_secundarios;
  par record;
  v_fica filiacao_vinculos;
  v_sai filiacao_vinculos;
  aberto boolean;
  unificados integer := 0;
  sem_unificar uuid[] := '{}';
  -- "vínculo:cadastro": o vínculo já absorveu um do cadastro. Cada vínculo
  -- absorve no máximo UM de cada cadastro, para não fundir dois vínculos que
  -- já conviviam num mesmo cadastro (só na regra automática).
  absorvidos text[] := '{}';
  pos integer := 0;
  item jsonb;
  c_emails_descartar text[];
  c_telefones_descartar text[];
  c_enderecos_descartar uuid[];
  c_emergencia_descartar uuid[];
  descartados text;
  guardados text;
  n_descartados integer := 0;
begin
  if p_secundarios is null or array_length(p_secundarios, 1) is null then
    raise exception 'Escolha ao menos um cadastro para incorporar.';
  end if;
  if p_principal = any(p_secundarios) then
    raise exception 'O cadastro principal não pode estar entre os incorporados.';
  end if;
  if not exists (
    select 1 from filiacoes
    where id = p_principal and emp_proprietaria_id = p_emp and filiacao_excluida is not true
  ) then
    raise exception 'Cadastro principal não encontrado (ou já excluído).';
  end if;
  if (
    select count(*) from filiacoes
    where id = any(p_secundarios) and emp_proprietaria_id = p_emp and filiacao_excluida is not true
  ) <> array_length(p_secundarios, 1) then
    raise exception 'Algum dos cadastros a incorporar não existe, é de outra entidade ou já foi excluído.';
  end if;

  -- 1. Os incorporados saem primeiro: liberam CPF e matrícula para o principal.
  select string_agg(coalesce(nome_completo, '?') || ' (mat. ' || coalesce(matricula_sindical, '—') || ')', '; ')
    into nomes from filiacoes where id = any(p_secundarios);
  update filiacoes
     set filiacao_excluida = true,
         mesclado_em_id = p_principal,
         mesclado_em = now(),
         mesclado_por = p_usuario,
         updated_at = now()
   where id = any(p_secundarios);

  -- 2. Campos escolhidos gravados no principal.
  for campo in select jsonb_object_keys(coalesce(p_campos, '{}'::jsonb)) loop
    if campo = any(permitidos) then
      execute format(
        'update filiacoes set %I = (jsonb_populate_record(null::filiacoes, $1)).%I where id = $2',
        campo, campo
      ) using p_campos, p_principal;
    end if;
  end loop;
  update filiacoes
     set matricula_sindical_numero = case
           when matricula_sindical ~ '^\d{1,9}$' then matricula_sindical::integer else null end,
         updated_at = now()
   where id = p_principal;

  -- O que não é escolha: o login de quem tinha, e o pedido de não receber a
  -- mala direta — quem pediu para parar em qualquer dos cadastros continua fora.
  update filiacoes f
     set usuario_id = coalesce(f.usuario_id, (
           select s.usuario_id from filiacoes s
            where s.id = any(p_secundarios) and s.usuario_id is not null
            order by s.created_at limit 1
         )),
         comunicados_optout_origem = case when f.comunicados_optout_em is not null then f.comunicados_optout_origem
           else (select s.comunicados_optout_origem from filiacoes s
                  where s.id = any(p_secundarios) and s.comunicados_optout_em is not null
                  order by s.comunicados_optout_em limit 1) end,
         comunicados_optout_em = coalesce(f.comunicados_optout_em, (
           select min(s.comunicados_optout_em) from filiacoes s where s.id = any(p_secundarios)
         ))
   where f.id = p_principal;

  -- 3. Vínculos do mesmo emprego em cadastros diferentes (antes de movê-los).
  --    Com p_vinculos: exatamente os pares que a pessoa escolheu. Sem ele: o
  --    mesmo emprego — mesma fonte, mesma matrícula, períodos que se sobrepõem.
  --    Um par por volta; cada volta apaga um vínculo, então o laço termina.
  loop
    if p_vinculos is null then
      select a.id as fica, b.id as sai into par
        from filiacao_vinculos a
        join filiacao_vinculos b
          on b.fonte_pagadora_id = a.fonte_pagadora_id
         and b.filiado_id <> a.filiado_id
         and nullif(ltrim(btrim(b.matricula), '0'), '') = nullif(ltrim(btrim(a.matricula), '0'), '')
         and coalesce(a.data_filiacao, '-infinity'::date) <= coalesce(b.data_desfiliacao, 'infinity'::date)
         and coalesce(b.data_filiacao, '-infinity'::date) <= coalesce(a.data_desfiliacao, 'infinity'::date)
       where a.filiado_id = any(todos) and b.filiado_id = any(todos)
         and a.emp_proprietaria_id = p_emp and b.emp_proprietaria_id = p_emp
         and not (b.id = any(sem_unificar))
         and not ((a.id::text || ':' || b.filiado_id::text) = any(absorvidos))
         and not ((b.id::text || ':' || a.filiado_id::text) = any(absorvidos))
       order by
         (coalesce(a.ficha_filiacao, a.filiacao_ficha, a.carta_desfiliacao, a.filiacao_desfiliacao_carta) is not null) desc,
         (a.filiado_id = p_principal) desc,
         a.data_filiacao nulls last, a.created_at, a.id, b.id
       limit 1;
      exit when not found;
    else
      exit when pos >= jsonb_array_length(p_vinculos);
      item := p_vinculos -> pos;
      pos := pos + 1;
      select (item ->> 'fica')::uuid as fica, (item ->> 'sai')::uuid as sai into par;
      if not exists (
        select 1
          from filiacao_vinculos a
          join filiacao_vinculos b on b.id = par.sai
         where a.id = par.fica
           and a.filiado_id = any(todos) and b.filiado_id = any(todos)
           and a.filiado_id <> b.filiado_id
           and a.fonte_pagadora_id is not distinct from b.fonte_pagadora_id
           and a.emp_proprietaria_id = p_emp and b.emp_proprietaria_id = p_emp
      ) then
        raise exception 'Só dá para unir vínculos da mesma fonte, de cadastros diferentes.';
      end if;
    end if;

    select * into v_fica from filiacao_vinculos where id = par.fica;
    select * into v_sai from filiacao_vinculos where id = par.sai;
    -- Se um dos dois segue aberto, o vínculo unificado segue aberto: dados de
    -- saída do outro não passam para ele (ficam na cópia do prontuário).
    aberto := v_fica.data_desfiliacao is null or v_sai.data_desfiliacao is null;
    begin
      for campo in
        select c.column_name::text
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'filiacao_vinculos'
           and c.is_generated = 'NEVER'
           and c.column_name not in (
             'id', 'filiado_id', 'emp_proprietaria_id', 'created_at', 'bubble_id', 'slug',
             'data_filiacao', 'data_desfiliacao', 'ficha_filiacao_aceita', 'carta_desfiliacao_aceita'
           )
           and not (aberto and c.column_name in (
             'carta_desfiliacao', 'filiacao_desfiliacao_carta', 'filiacao_desfiliacao_comprovante',
             'filiacao_data_saida', 'data_saida_demissao', 'fonte_pg_demissao',
             'desfiliacao_motivo', 'desfiliacao_motivo_detalhe'
           ))
      loop
        execute format(
          'update filiacao_vinculos set %1$I = (jsonb_populate_record(null::filiacao_vinculos, $1)).%1$I
            where id = $2 and (%1$I is null or %1$I::text = '''') and coalesce($1 ->> %1$L, '''') <> ''''',
          campo
        ) using to_jsonb(v_sai), par.fica;
      end loop;
      update filiacao_vinculos
         set data_filiacao = least(v_fica.data_filiacao, v_sai.data_filiacao),
             data_desfiliacao = case when aberto then null
                                     else greatest(v_fica.data_desfiliacao, v_sai.data_desfiliacao) end,
             ficha_filiacao_aceita = coalesce(v_fica.ficha_filiacao_aceita, false) or coalesce(v_sai.ficha_filiacao_aceita, false),
             carta_desfiliacao_aceita = case when aberto then v_fica.carta_desfiliacao_aceita
               else coalesce(v_fica.carta_desfiliacao_aceita, false) or coalesce(v_sai.carta_desfiliacao_aceita, false) end
       where id = par.fica;

      -- O que aponta para o vínculo removido passa para o que fica.
      for ref in
        select cl.relname::text as tabela, att.attname::text as coluna
          from pg_constraint con
          join pg_class cl on cl.oid = con.conrelid
          join pg_namespace ns on ns.oid = cl.relnamespace
          join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
         where con.contype = 'f'
           and con.confrelid = 'public.filiacao_vinculos'::regclass
           and ns.nspname = 'public'
        union
        select c.table_name::text, c.column_name::text
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'oficios_filiados' and c.column_name = 'vinculo_id'
      loop
        execute format('update %I set %I = $1 where %I = $2', ref.tabela, ref.coluna, ref.coluna)
          using par.fica, par.sai;
      end loop;

      insert into filiacao_prontuario (filiacao_id, data, tipo, descricao, diretor_funcionario_id, emp_proprietaria_id, created_at, modified_at)
      values (
        p_principal, now(), 'Atualização cadastral',
        'Vínculos unificados na mesclagem (mesma fonte, matrícula ' || coalesce(nullif(btrim(v_fica.matricula), ''), 'não informada') ||
        '): ficou um só, com filiação em ' ||
        coalesce(to_char(least(v_fica.data_filiacao, v_sai.data_filiacao), 'DD/MM/YYYY'), 'data não informada') ||
        '. Cópia do vínculo removido: ' || jsonb_strip_nulls(to_jsonb(v_sai))::text,
        p_usuario, p_emp, now(), now()
      );
      delete from filiacao_vinculos where id = par.sai;
      absorvidos := absorvidos || (v_fica.id::text || ':' || v_sai.filiado_id::text);
      unificados := unificados + 1;
    exception when unique_violation or foreign_key_violation then
      -- Algo impede juntar este par: os dois seguem, e o laço não volta a ele.
      sem_unificar := sem_unificar || par.sai;
    end;
  end loop;

  -- 4. Tudo que aponta para os incorporados passa a apontar para o principal.
  for ref in
    select cl.relname::text as tabela, att.attname::text as coluna
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = 'public.filiacoes'::regclass
       and ns.nspname = 'public'
       and cl.relname <> 'filiacoes'
    union
    select c.table_name::text, c.column_name::text
      from information_schema.columns c
     where c.table_schema = 'public'
       and (c.table_name::text, c.column_name::text) in (('diretoria_integrantes', 'filiacao_id'), ('oficios_filiados', 'filiacao_id'))
  loop
    begin
      execute format('update %I set %I = $1 where %I = any($2)', ref.tabela, ref.coluna, ref.coluna)
        using p_principal, p_secundarios;
      get diagnostics n = row_count;
      if n > 0 then
        movidos := movidos || jsonb_build_object(ref.tabela || '.' || ref.coluna, n);
      end if;
    exception when unique_violation then
      -- O principal já tem a mesma linha (ex.: o mesmo ofício): fica no
      -- incorporado, que continua consultável pelo histórico.
      pendentes := pendentes || to_jsonb(ref.tabela || '.' || ref.coluna);
    end;
  end loop;

  -- Quem já tinha sido incorporado por um dos incorporados passa a apontar
  -- para o principal (mesclagens em cadeia).
  update filiacoes set mesclado_em_id = p_principal where mesclado_em_id = any(p_secundarios);

  -- Os contatos de emergência são lidos pelo CPF: os que vieram seguem o do principal.
  update filiacao_contatos_emergencia
     set cpf = (select cpf from filiacoes where id = p_principal)
   where filiado_id = p_principal;

  -- 5. A união dos contatos, como a pessoa decidiu.
  if p_contatos is not null then
    select coalesce(array_agg(lower(btrim(x))), '{}') into c_emails_descartar
      from jsonb_array_elements_text(coalesce(p_contatos -> 'emails_descartar', '[]'::jsonb)) x;
    select coalesce(array_agg(regexp_replace(x, '\D', '', 'g')), '{}') into c_telefones_descartar
      from jsonb_array_elements_text(coalesce(p_contatos -> 'telefones_descartar', '[]'::jsonb)) x;
    select coalesce(array_agg(x::uuid), '{}') into c_enderecos_descartar
      from jsonb_array_elements_text(coalesce(p_contatos -> 'enderecos_descartar', '[]'::jsonb)) x;
    select coalesce(array_agg(x::uuid), '{}') into c_emergencia_descartar
      from jsonb_array_elements_text(coalesce(p_contatos -> 'emergencia_descartar', '[]'::jsonb)) x;

    delete from emails
     where filiado_id = p_principal and emp_proprietaria_id = p_emp
       and lower(btrim(email)) = any(c_emails_descartar);
    delete from telefones
     where filiado_id = p_principal and emp_proprietaria_id = p_emp
       and regexp_replace(coalesce(numero, ''), '\D', '', 'g') = any(c_telefones_descartar);
    delete from filiacao_contatos_emergencia
     where filiado_id = p_principal and emp_proprietaria_id = p_emp
       and id = any(c_emergencia_descartar);
    -- Endereço pode estar citado em outro registro (oposição, vínculo): aí fica.
    for item in select to_jsonb(x) from unnest(c_enderecos_descartar) x loop
      begin
        delete from enderecos
         where id = (item #>> '{}')::uuid and filiado_id = p_principal and emp_proprietaria_id = p_emp;
      exception when foreign_key_violation then
        null;
      end;
    end loop;

    -- O que não coube nos campos do cadastro vai para "Outros contatos", sem repetir.
    for item in select * from jsonb_array_elements(coalesce(p_contatos -> 'emails_outros', '[]'::jsonb)) loop
      insert into emails (email, tipo_email, filiado_id, emp_proprietaria_id)
      select lower(btrim(item ->> 'email')), item ->> 'tipo', p_principal, p_emp
       where coalesce(btrim(item ->> 'email'), '') <> ''
         and not exists (
           select 1 from emails e
            where e.filiado_id = p_principal and lower(btrim(e.email)) = lower(btrim(item ->> 'email'))
         );
    end loop;
    for item in select * from jsonb_array_elements(coalesce(p_contatos -> 'telefones_outros', '[]'::jsonb)) loop
      insert into telefones (numero, whatsapp, filiado_id, emp_proprietaria_id)
      select regexp_replace(item ->> 'numero', '\D', '', 'g'), coalesce((item ->> 'whatsapp')::boolean, false), p_principal, p_emp
       where regexp_replace(coalesce(item ->> 'numero', ''), '\D', '', 'g') <> ''
         and not exists (
           select 1 from telefones t
            where t.filiado_id = p_principal
              and regexp_replace(coalesce(t.numero, ''), '\D', '', 'g') = regexp_replace(item ->> 'numero', '\D', '', 'g')
         );
    end loop;
    for item in select * from jsonb_array_elements(coalesce(p_contatos -> 'enderecos_outros', '[]'::jsonb)) loop
      insert into enderecos (cep, logradouro, numero, complemento, bairro, cidade, estado, nome_endereco, filiado_id, emp_proprietaria_id)
      values (item ->> 'cep', item ->> 'logradouro', item ->> 'numero', item ->> 'complemento', item ->> 'bairro',
              item ->> 'cidade', item ->> 'estado', 'Do cadastro incorporado', p_principal, p_emp);
    end loop;

    -- A mesma conta nos dois cadastros vira uma: o que aponta para a repetida
    -- (ordens de pagamento) passa para a que fica.
    for item in select * from jsonb_array_elements(coalesce(p_contatos -> 'contas_unir', '[]'::jsonb)) loop
      if exists (select 1 from dados_bancarios where id = (item ->> 'fica')::uuid and filiado_id = p_principal)
         and exists (select 1 from dados_bancarios where id = (item ->> 'sai')::uuid and filiado_id = p_principal) then
        begin
          for ref in
            select cl.relname::text as tabela, att.attname::text as coluna
              from pg_constraint con
              join pg_class cl on cl.oid = con.conrelid
              join pg_namespace ns on ns.oid = cl.relnamespace
              join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
             where con.contype = 'f'
               and con.confrelid = 'public.dados_bancarios'::regclass
               and ns.nspname = 'public'
          loop
            execute format('update %I set %I = $1 where %I = $2', ref.tabela, ref.coluna, ref.coluna)
              using (item ->> 'fica')::uuid, (item ->> 'sai')::uuid;
          end loop;
          delete from dados_bancarios where id = (item ->> 'sai')::uuid;
        exception when unique_violation or foreign_key_violation then
          null; -- as duas seguem; nada se perde
        end;
      end if;
    end loop;
    if coalesce(p_contatos ->> 'conta_favorita', '') <> '' then
      update dados_bancarios
         set favorito = (id = (p_contatos ->> 'conta_favorita')::uuid)
       where filiado_id = p_principal;
    end if;

    select string_agg(x, ', ') into descartados from (
      select jsonb_array_elements_text(coalesce(p_contatos -> 'rotulos_descartados', '[]'::jsonb)) as x
    ) r;
    select string_agg(x, ', ') into guardados from (
      select item_e ->> 'email' as x from jsonb_array_elements(coalesce(p_contatos -> 'emails_outros', '[]'::jsonb)) item_e
      union all
      select item_t ->> 'numero' from jsonb_array_elements(coalesce(p_contatos -> 'telefones_outros', '[]'::jsonb)) item_t
      union all
      select concat_ws(', ', item_d ->> 'logradouro', item_d ->> 'numero', item_d ->> 'cidade')
        from jsonb_array_elements(coalesce(p_contatos -> 'enderecos_outros', '[]'::jsonb)) item_d
    ) g;
    n_descartados := coalesce(jsonb_array_length(p_contatos -> 'rotulos_descartados'), 0);
  end if;

  -- 6. Registro no prontuário do principal.
  insert into filiacao_prontuario (filiacao_id, data, tipo, descricao, diretor_funcionario_id, emp_proprietaria_id, created_at, modified_at)
  values (
    p_principal, now(), 'Atualização cadastral',
    'Cadastro duplicado mesclado: incorporou ' || nomes || '. O histórico foi movido para este cadastro; os incorporados ficaram excluídos.' ||
    coalesce(' Guardados em Outros contatos: ' || guardados || '.', '') ||
    case when n_descartados > 0 then ' Não guardados, por decisão de quem mesclou: ' || descartados || '.' else '' end,
    p_usuario, p_emp, now(), now()
  );

  return jsonb_build_object(
    'movidos', movidos,
    'pendentes', pendentes,
    'vinculos_unificados', unificados,
    'vinculos_nao_unificados', coalesce(array_length(sem_unificar, 1), 0)
  );
end;
$_$;

revoke all on function public.mesclar_filiacoes(uuid, uuid, uuid[], jsonb, uuid, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.mesclar_filiacoes(uuid, uuid, uuid[], jsonb, uuid, jsonb, jsonb) to service_role;
