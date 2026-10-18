-- ============================================================================
-- Fornecedores: permissão de edição e mescla de cadastros duplicados
-- (05/10/2026). Idempotente — rodar no SQL Editor do Supabase ANTES do deploy
-- (`atualizarAcesso` grava todas as chaves do catálogo: a coluna nova precisa
-- existir antes).
--
-- 1. PERMISSÃO `aquisicoes_fornecedores_edicao`: cadastrar, editar, inativar,
--    excluir e mesclar fornecedores. Até aqui isso vinha de
--    `aquisicoes_compras_edicao`; quem tem essa chave HOJE recebe a nova, para
--    ninguém perder acesso na virada. Daqui em diante são independentes.
--
-- 2. MESCLA: `mesclar_fornecedores` junta cadastros da MESMA empresa (mesmo
--    CPF/CNPJ, em geral duplicados pela migração do Bubble) num só, numa
--    transação: move para o principal TUDO que aponta para os outros — ordens
--    de pagamento, contratos, propostas, fornecimentos, RPAs, dados
--    bancários, endereços, notas do patrimônio, viagens, hotel, vínculos de
--    filiados (a tabela `empresa` também guarda empregadores)… — descobrindo
--    as chaves estrangeiras para empresa.id no catálogo. Campos vazios do
--    principal são completados pelos incorporados. Os incorporados ficam
--    INATIVOS, apontando para o principal (`mesclado_em_id`). Nada é apagado.
-- ============================================================================

-- ── 1. Permissão ────────────────────────────────────────────────────────────
alter table public.permissoes
  add column if not exists aquisicoes_fornecedores_edicao boolean;

comment on column public.permissoes.aquisicoes_fornecedores_edicao is
  'Cadastrar, editar, inativar, excluir e mesclar fornecedores (Aquisição › Fornecedores).';

-- Quem já editava fornecedores (pela chave de compras) continua editando.
update public.permissoes
   set aquisicoes_fornecedores_edicao = true
 where aquisicoes_compras_edicao is true
   and aquisicoes_fornecedores_edicao is distinct from true;

-- Perfil "Compras e Contratos" ganha a chave nova.
insert into public.perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select pf.id, pf.emp_proprietaria_id, 'aquisicoes_fornecedores_edicao'
  from public.perfis pf
 where pf.nome = 'Compras e Contratos'
   and not exists (
     select 1 from public.perfil_permissoes pp
      where pp.perfil_id = pf.id and pp.chave = 'aquisicoes_fornecedores_edicao'
   );

-- ── 2. Mescla ───────────────────────────────────────────────────────────────
alter table public.empresa add column if not exists mesclado_em_id uuid references public.empresa(id);
alter table public.empresa add column if not exists mesclado_em timestamptz;
alter table public.empresa add column if not exists mesclado_por uuid references public.usuarios(id);

comment on column public.empresa.mesclado_em_id is
  'Cadastro que incorporou este (mescla de fornecedor duplicado). Este fica inativo; os registros foram movidos para lá.';

create index if not exists idx_empresa_mesclado_em on public.empresa (mesclado_em_id) where mesclado_em_id is not null;

create or replace function public.mesclar_fornecedores(
  p_emp uuid,
  p_principal uuid,
  p_secundarios uuid[],
  p_usuario uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  ref record;
  campo text;
  n integer;
  movidos jsonb := '{}'::jsonb;
  pendentes jsonb := '[]'::jsonb;
  sec uuid;
  v_sai empresa;
begin
  if p_secundarios is null or array_length(p_secundarios, 1) is null then
    raise exception 'Escolha ao menos um cadastro para incorporar.';
  end if;
  if p_principal = any(p_secundarios) then
    raise exception 'O cadastro principal não pode estar entre os incorporados.';
  end if;
  if not exists (
    select 1 from empresa where id = p_principal and emp_proprietaria_id = p_emp and mesclado_em_id is null
  ) then
    raise exception 'Cadastro principal não encontrado (ou já incorporado a outro).';
  end if;
  if (
    select count(*) from empresa
     where id = any(p_secundarios) and emp_proprietaria_id = p_emp and mesclado_em_id is null
  ) <> array_length(p_secundarios, 1) then
    raise exception 'Algum dos cadastros a incorporar não existe, é de outra entidade ou já foi incorporado.';
  end if;
  -- Uma entidade (tenant) nunca é incorporada.
  if exists (select 1 from empresa where emp_proprietaria_id = any(p_secundarios))
     or exists (select 1 from tenants where empresa_id = any(p_secundarios)) then
    raise exception 'Um dos cadastros é a própria entidade e não pode ser incorporado.';
  end if;

  -- 1. Campos vazios do principal completados pelos incorporados (na ordem).
  foreach sec in array p_secundarios loop
    select * into v_sai from empresa where id = sec;
    for campo in
      select c.column_name::text
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'empresa'
         and c.is_generated = 'NEVER'
         and c.data_type <> 'boolean'
         and c.column_name not in (
           'id', 'emp_proprietaria_id', 'created_at', 'updated_at', 'bubble_id', 'slug',
           'inativa', 'inativa_data', 'mesclado_em_id', 'mesclado_em', 'mesclado_por'
         )
    loop
      execute format(
        'update empresa set %1$I = (jsonb_populate_record(null::empresa, $1)).%1$I
          where id = $2 and (%1$I is null or %1$I::text = '''') and coalesce($1 ->> %1$L, '''') <> ''''',
        campo
      ) using to_jsonb(v_sai), p_principal;
    end loop;
  end loop;
  -- Papéis somam: se um dos cadastros era empregador, locadora, conveniador
  -- ou entidade apoiada, o principal passa a ser. Bloqueio também soma.
  update empresa p
     set empresa = coalesce(p.empresa, false) or s.empresa,
         locadora_veiculos = coalesce(p.locadora_veiculos, false) or s.locadora_veiculos,
         conveniador = coalesce(p.conveniador, false) or s.conveniador,
         fundo_pensao = coalesce(p.fundo_pensao, false) or s.fundo_pensao,
         beneficiario_ajuda = coalesce(p.beneficiario_ajuda, false) or s.beneficiario_ajuda,
         entidade_apoiada = coalesce(p.entidade_apoiada, false) or s.entidade_apoiada,
         fornecedor_bloqueado = coalesce(p.fornecedor_bloqueado, false) or s.fornecedor_bloqueado,
         updated_at = now()
    from (
      select bool_or(coalesce(empresa, false)) as empresa,
             bool_or(coalesce(locadora_veiculos, false)) as locadora_veiculos,
             bool_or(coalesce(conveniador, false)) as conveniador,
             bool_or(coalesce(fundo_pensao, false)) as fundo_pensao,
             bool_or(coalesce(beneficiario_ajuda, false)) as beneficiario_ajuda,
             bool_or(coalesce(entidade_apoiada, false)) as entidade_apoiada,
             bool_or(coalesce(fornecedor_bloqueado, false) or coalesce(bloqueado, false)) as fornecedor_bloqueado
        from empresa where id = any(p_secundarios)
    ) s
   where p.id = p_principal;

  -- 2. Tudo que aponta para os incorporados passa a apontar para o principal.
  --    Fica de fora a posse do registro (emp_proprietaria_id = o tenant) e a
  --    própria tabela empresa (mesclado_em_id, tratado abaixo).
  for ref in
    select cl.relname::text as tabela, att.attname::text as coluna
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = 'public.empresa'::regclass
       and ns.nspname = 'public'
       and att.attname <> 'emp_proprietaria_id'
       and cl.relname not in ('empresa', 'tenants')
  loop
    begin
      execute format('update %I set %I = $1 where %I = any($2)', ref.tabela, ref.coluna, ref.coluna)
        using p_principal, p_secundarios;
      get diagnostics n = row_count;
      if n > 0 then
        movidos := movidos || jsonb_build_object(ref.tabela || '.' || ref.coluna, n);
      end if;
    exception when unique_violation then
      -- O principal já tem a mesma linha (ex.: a mesma categoria): fica no
      -- incorporado, que continua consultável.
      pendentes := pendentes || to_jsonb(ref.tabela || '.' || ref.coluna);
    end;
  end loop;

  -- Lista de fornecedores convidados de um pedido de cotação (texto[]).
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'compras_pedido' and column_name = 'lista_fornecedores'
  ) then
    foreach sec in array p_secundarios loop
      execute 'update compras_pedido set lista_fornecedores = array_replace(lista_fornecedores, $1, $2)
                where $1 = any(lista_fornecedores)'
        using sec::text, p_principal::text;
    end loop;
  end if;

  -- 3. Incorporados ficam inativos, apontando para o principal; mesclas em
  --    cadeia passam a apontar para o principal também.
  update empresa set mesclado_em_id = p_principal where mesclado_em_id = any(p_secundarios);
  update empresa
     set inativa = true,
         inativa_data = coalesce(inativa_data, (now() at time zone 'America/Sao_Paulo')::date),
         mesclado_em_id = p_principal,
         mesclado_em = now(),
         mesclado_por = p_usuario,
         updated_at = now()
   where id = any(p_secundarios);

  return jsonb_build_object('movidos', movidos, 'pendentes', pendentes);
end;
$$;

revoke all on function public.mesclar_fornecedores(uuid, uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.mesclar_fornecedores(uuid, uuid, uuid[], uuid) to service_role;

notify pgrst, 'reload schema';
