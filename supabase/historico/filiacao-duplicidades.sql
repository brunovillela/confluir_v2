-- ============================================================================
-- Duplicidades de cadastro de filiação (2026-09-16). Idempotente — rodar no
-- SQL Editor do Supabase.
--
-- Varredura de 16/09: 507 cadastros com CPF "0", 165 CPFs válidos repetidos,
-- 10 matrículas sindicais repetidas, 328 nomes com provável duplicidade — em
-- boa parte refiliações que viraram um cadastro novo.
--
-- 1. MESCLAGEM: `mesclar_filiacoes` junta cadastros da mesma pessoa num só,
--    numa transação: grava os campos escolhidos no principal, move para ele
--    TUDO que aponta para os outros (vínculos, contribuições, prontuário,
--    contatos, reembolsos, hospedagem, saúde, jurídico… — as 26 chaves
--    estrangeiras para filiacoes.id, descobertas no catálogo, mais as duas
--    colunas sem chave declarada) e marca os outros como excluídos, apontando
--    para o principal. Nada é apagado.
--    VÍNCULOS REPETIDOS (17/09): o mesmo emprego registrado em DOIS cadastros
--    da pessoa — mesma fonte, mesma matrícula na fonte, períodos que se
--    sobrepõem — vira um vínculo só: fica o que tem documento (ou o do
--    principal), com a filiação mais antiga e os campos vazios completados
--    pelo outro; a cópia do removido vai para o prontuário. Vínculos repetidos
--    DENTRO de um mesmo cadastro são legítimos e não são tocados, nem
--    refiliações com períodos separados.
-- 2. "NÃO É DUPLICIDADE": `filiacao_duplicidades_ignoradas` guarda os grupos
--    conferidos (homônimos) para não voltarem à lista.
-- ============================================================================

alter table filiacoes add column if not exists mesclado_em_id uuid references filiacoes(id);
alter table filiacoes add column if not exists mesclado_em timestamptz;
alter table filiacoes add column if not exists mesclado_por uuid references usuarios(id);

comment on column filiacoes.mesclado_em_id is
  'Cadastro que incorporou este (mesclagem de duplicidade). Este fica excluído; o histórico foi movido para lá.';

create index if not exists idx_filiacoes_mesclado_em on filiacoes (mesclado_em_id) where mesclado_em_id is not null;

-- ── Grupos conferidos que NÃO são duplicidade ───────────────────────────────

create table if not exists filiacao_duplicidades_ignoradas (id uuid primary key default gen_random_uuid());
alter table filiacao_duplicidades_ignoradas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_duplicidades_ignoradas add column if not exists tipo text not null default 'nome';
alter table filiacao_duplicidades_ignoradas add column if not exists chave text not null default '';
alter table filiacao_duplicidades_ignoradas add column if not exists cadastros uuid[] not null default '{}';
alter table filiacao_duplicidades_ignoradas add column if not exists motivo text;
alter table filiacao_duplicidades_ignoradas add column if not exists criado_por uuid references usuarios(id);
alter table filiacao_duplicidades_ignoradas add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_filiacao_duplicidades_ignoradas
  on filiacao_duplicidades_ignoradas (emp_proprietaria_id, tipo, chave);

alter table filiacao_duplicidades_ignoradas enable row level security;
drop policy if exists tenant_isolation on filiacao_duplicidades_ignoradas;
create policy tenant_isolation on filiacao_duplicidades_ignoradas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on filiacao_duplicidades_ignoradas to authenticated;
drop trigger if exists set_emp_from_jwt on filiacao_duplicidades_ignoradas;
create trigger set_emp_from_jwt before insert on filiacao_duplicidades_ignoradas
  for each row execute function public.set_emp_from_jwt();

-- ── Mesclagem ───────────────────────────────────────────────────────────────

create or replace function public.mesclar_filiacoes(
  p_emp uuid,
  p_principal uuid,
  p_secundarios uuid[],
  p_campos jsonb,
  p_usuario uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  -- Campos do cadastro que a tela deixa escolher entre os duplicados.
  permitidos text[] := array[
    'nome_completo', 'nome_social', 'cpf', 'matricula_sindical', 'sexo', 'nascimento_data',
    'email_pessoal', 'email_corporativo', 'telefone_1', 'telefone_1_whatsapp', 'telefone_2',
    'telefone_2_whatsapp', 'endereco_cep', 'endereco_logradouro', 'endereco_numero',
    'endereco_complemento', 'endereco_bairro', 'endereco_cidade', 'endereco_estado',
    'filiacao_condicao', 'tl_lgpd_id', 'tl_lgpd_data', 'tl_desconto_id', 'tl_desconto_data',
    'foto', 'recebe_mensagens'
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
  -- já conviviam num mesmo cadastro.
  absorvidos text[] := '{}';
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

  -- 3. Vínculos repetidos entre os cadastros (antes de movê-los): o mesmo
  --    emprego — mesma fonte, mesma matrícula, períodos que se sobrepõem —
  --    registrado em cadastros DIFERENTES vira um só. Um par por volta; cada
  --    volta apaga um vínculo, então o laço termina.
  loop
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
             'filiacao_data_saida', 'data_saida_demissao', 'fonte_pg_demissao'
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
        'Vínculos repetidos unificados na mesclagem (mesma fonte, matrícula ' || btrim(v_fica.matricula) ||
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

  -- 5. Registro no prontuário do principal.
  insert into filiacao_prontuario (filiacao_id, data, tipo, descricao, diretor_funcionario_id, emp_proprietaria_id, created_at, modified_at)
  values (
    p_principal, now(), 'Atualização cadastral',
    'Cadastro duplicado mesclado: incorporou ' || nomes || '. O histórico foi movido para este cadastro; os incorporados ficaram excluídos.',
    p_usuario, p_emp, now(), now()
  );

  return jsonb_build_object('movidos', movidos, 'pendentes', pendentes, 'vinculos_unificados', unificados);
end;
$$;

revoke all on function public.mesclar_filiacoes(uuid, uuid, uuid[], jsonb, uuid) from public, anon, authenticated;
grant execute on function public.mesclar_filiacoes(uuid, uuid, uuid[], jsonb, uuid) to service_role;

notify pgrst, 'reload schema';
