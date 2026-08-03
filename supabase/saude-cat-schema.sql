-- Confluir — Schema da CAT (atualizado em 2026-07-20)
--
-- Estrutura derivada do formulário oficial da CAT (campos 1 a 50), substituindo
-- a herdada do Bubble (`campo_NN_*_text`). O número do campo no formulário fica
-- registrado em `comment on column`, preservando a rastreabilidade legal.
--
-- A tabela migrada do Bubble tinha 13.420 linhas 100% vazias e NÃO continha 11
-- campos do formulário — entre eles o CPF (campo 12), que é o que permite ligar
-- a CAT ao filiado. Todos foram incluídos aqui.
--
-- Nenhuma tabela referencia saude_cat por FK (verificado em 20/07/2026).
-- Executar no SQL Editor do Supabase ANTES da importação do CSV.

-- ---------------------------------------------------------------------------
-- 1) Trava de segurança — aborta se já houver dado de negócio na tabela
-- ---------------------------------------------------------------------------
do $$
declare
  v_com_dados bigint;
begin
  select count(*) into v_com_dados
  from public.saude_cat t
  where exists (
    select 1
    from jsonb_each(
      to_jsonb(t) - 'id' - 'bubble_id' - 'emp_proprietaria_id'
                  - 'created_at' - 'updated_at'
    ) as campo(chave, valor)
    where campo.valor <> 'null'::jsonb
  );

  if v_com_dados > 0 then
    raise exception
      'ABORTADO: % linhas de saude_cat contêm dados. Este script recria a '
      'tabela do zero e destruiria a importação.', v_com_dados;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Recria a tabela conforme o formulário oficial
-- ---------------------------------------------------------------------------
drop table if exists public.saude_cat;

create table public.saude_cat (
  id                  uuid primary key default gen_random_uuid(),
  bubble_id           text unique,
  emp_proprietaria_id uuid not null references public.empresa (id),

  -- Emitente (campos 1-6) ------------------------------------------------
  emitente             text,
  tipo_cat             text,
  iniciativa_cat       text,
  fonte_cadastramento  text,
  numero_cat           text,
  recibo_esocial       text,

  -- Empregador (campos 7-10) ---------------------------------------------
  empregador_id            uuid references public.empresa (id),
  empregador_razao_social  text,
  empregador_tipo          text,
  empregador_inscricao     text,
  empregador_cnae          text,

  -- Acidentado (campos 11-18) --------------------------------------------
  filiado_id                uuid references public.filiacoes (id),
  trabalhador_nome          text,
  trabalhador_cpf           text,
  trabalhador_nascimento    date,
  trabalhador_sexo          text,
  trabalhador_estado_civil  text,
  trabalhador_cbo_codigo    text,
  trabalhador_cbo           text,
  filiacao_previdencia      text,
  areas                     text,

  -- Acidente (campos 19-24) ----------------------------------------------
  data_acidente            date,
  hora_acidente            text,
  horas_trabalhadas_antes  text,
  tipo_acidente            text,
  houve_afastamento        boolean,
  ultimo_dia_trabalhado    date,

  -- Local do acidente (campos 25-29) -------------------------------------
  local_acidente       text,
  local_especificacao  text,
  local_inscricao      text,
  local_uf             text,
  local_municipio      text,
  local_pais           text,

  -- Lesão (campos 31-34) -------------------------------------------------
  -- Os campos 31, 32 e 34 vêm da origem como "<código 9 dígitos> – <DESCRIÇÃO>".
  -- Guardamos separado: o código é a chave estável para agrupar e comparar;
  -- a descrição é rótulo. Registros antigos (~2019) chegam truncados e sem
  -- código — nesses, `*_codigo` fica nulo e `*_truncado` marca para revisão.
  parte_atingida_codigo     text,
  parte_atingida            text,
  agente_causador_codigo    text,
  agente_causador           text,
  lateralidade              text,
  situacao_geradora_codigo  text,
  situacao_geradora         text,
  descricao_truncada        boolean not null default false,

  -- Ocorrências (campos 35-38) -------------------------------------------
  houve_registro_policial  boolean,
  houve_morte              boolean,
  data_obito               date,
  observacoes_acidente     text,

  -- Atendimento médico (campos 39-44) ------------------------------------
  data_recebimento                date,
  data_atendimento                date,
  hora_atendimento                text,
  houve_internacao                boolean,
  duracao_tratamento_dias         integer,
  afastamento_durante_tratamento  boolean,

  -- Atestado médico (campos 45-50) ---------------------------------------
  natureza_lesao_codigo text,
  natureza_lesao        text,
  diagnostico_provavel  text,
  cid10                 text,
  cid10_descricao       text,
  local_e_data          text,
  medico_nome_crm_uf    text,
  observacoes_atestado  text,

  -- Anexo (não é campo do formulário) ------------------------------------
  arquivo_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saude_cat_cpf_digitos
    check (trabalhador_cpf is null or trabalhador_cpf ~ '^[0-9]{11}$')
);

-- ---------------------------------------------------------------------------
-- 3) Rastreabilidade com o formulário oficial da CAT
-- ---------------------------------------------------------------------------
comment on table public.saude_cat is
  'Comunicações de Acidente de Trabalho. Os comentários por coluna indicam o '
  'número do campo no formulário oficial da CAT.';

comment on column public.saude_cat.emitente                       is 'CAT campo 1';
comment on column public.saude_cat.tipo_cat                       is 'CAT campo 2';
comment on column public.saude_cat.iniciativa_cat                 is 'CAT campo 3';
comment on column public.saude_cat.fonte_cadastramento            is 'CAT campo 4';
comment on column public.saude_cat.numero_cat                     is 'CAT campo 5';
comment on column public.saude_cat.recibo_esocial                 is 'CAT campo 6 — recibo do evento no eSocial da CAT de origem';
comment on column public.saude_cat.empregador_razao_social        is 'CAT campo 7';
comment on column public.saude_cat.empregador_tipo                is 'CAT campo 8';
comment on column public.saude_cat.empregador_inscricao           is 'CAT campo 9';
comment on column public.saude_cat.empregador_cnae                is 'CAT campo 10';
comment on column public.saude_cat.trabalhador_nome               is 'CAT campo 11';
comment on column public.saude_cat.trabalhador_cpf                is 'CAT campo 12 — só dígitos; chave de ligação com filiacoes.cpf';
comment on column public.saude_cat.trabalhador_nascimento         is 'CAT campo 13';
comment on column public.saude_cat.trabalhador_sexo               is 'CAT campo 14';
comment on column public.saude_cat.trabalhador_estado_civil       is 'CAT campo 15';
comment on column public.saude_cat.trabalhador_cbo_codigo         is 'CAT campo 16 — código CBO';
comment on column public.saude_cat.trabalhador_cbo                is 'CAT campo 16 — descrição da ocupação';
comment on column public.saude_cat.filiacao_previdencia           is 'CAT campo 17';
comment on column public.saude_cat.areas                          is 'CAT campo 18';
comment on column public.saude_cat.data_acidente                  is 'CAT campo 19';
comment on column public.saude_cat.hora_acidente                  is 'CAT campo 20';
comment on column public.saude_cat.horas_trabalhadas_antes        is 'CAT campo 21';
comment on column public.saude_cat.tipo_acidente                  is 'CAT campo 22';
comment on column public.saude_cat.houve_afastamento              is 'CAT campo 23';
comment on column public.saude_cat.ultimo_dia_trabalhado          is 'CAT campo 24';
comment on column public.saude_cat.local_acidente                 is 'CAT campo 25';
comment on column public.saude_cat.local_especificacao            is 'CAT campo 26';
comment on column public.saude_cat.local_inscricao                is 'CAT campo 27';
comment on column public.saude_cat.local_uf                       is 'CAT campo 28';
comment on column public.saude_cat.local_municipio                is 'CAT campo 29';
comment on column public.saude_cat.local_pais                     is 'CAT campo 30';
comment on column public.saude_cat.parte_atingida_codigo          is 'CAT campo 31 — código (9 dígitos)';
comment on column public.saude_cat.parte_atingida                 is 'CAT campo 31 — descrição';
comment on column public.saude_cat.agente_causador_codigo         is 'CAT campo 32 — código (9 dígitos)';
comment on column public.saude_cat.agente_causador                is 'CAT campo 32 — descrição';
comment on column public.saude_cat.lateralidade                   is 'CAT campo 33';
comment on column public.saude_cat.situacao_geradora_codigo       is 'CAT campo 34 — código (9 dígitos)';
comment on column public.saude_cat.situacao_geradora              is 'CAT campo 34 — descrição';
comment on column public.saude_cat.descricao_truncada             is 'Registro de origem antiga: descrições dos campos 31/32/34/45 chegaram cortadas e sem código. Marca para revisão.';
comment on column public.saude_cat.houve_registro_policial        is 'CAT campo 35';
comment on column public.saude_cat.houve_morte                    is 'CAT campo 36';
comment on column public.saude_cat.data_obito                     is 'CAT campo 37';
comment on column public.saude_cat.observacoes_acidente           is 'CAT campo 38';
comment on column public.saude_cat.data_recebimento               is 'CAT campo 39';
comment on column public.saude_cat.data_atendimento               is 'CAT campo 40';
comment on column public.saude_cat.hora_atendimento               is 'CAT campo 41';
comment on column public.saude_cat.houve_internacao               is 'CAT campo 42';
comment on column public.saude_cat.duracao_tratamento_dias        is 'CAT campo 43';
comment on column public.saude_cat.afastamento_durante_tratamento is 'CAT campo 44';
comment on column public.saude_cat.natureza_lesao_codigo          is 'CAT campo 45 — código (9 dígitos)';
comment on column public.saude_cat.natureza_lesao                 is 'CAT campo 45 — descrição';
comment on column public.saude_cat.diagnostico_provavel           is 'CAT campo 46';
comment on column public.saude_cat.cid10                          is 'CAT campo 47 — código CID-10 normalizado com ponto (ex.: S01.4)';
comment on column public.saude_cat.cid10_descricao                is 'CAT campo 47 — descrição';
comment on column public.saude_cat.local_e_data                   is 'CAT campo 48';
comment on column public.saude_cat.medico_nome_crm_uf             is 'CAT campo 49';
comment on column public.saude_cat.observacoes_atestado           is 'CAT campo 50';

-- ---------------------------------------------------------------------------
-- 4) Índices de consulta
-- ---------------------------------------------------------------------------
create index saude_cat_data_acidente_idx
  on public.saude_cat (data_acidente desc nulls last);

create index saude_cat_numero_idx
  on public.saude_cat (numero_cat)
  where numero_cat is not null;

create index saude_cat_cpf_idx
  on public.saude_cat (trabalhador_cpf)
  where trabalhador_cpf is not null;

create index saude_cat_filiado_idx
  on public.saude_cat (filiado_id, data_acidente desc)
  where filiado_id is not null;

create index saude_cat_empregador_idx
  on public.saude_cat (empregador_id)
  where empregador_id is not null;

create index saude_cat_trabalhador_idx
  on public.saude_cat (trabalhador_nome);

-- Agrupamentos do painel: causas, partes atingidas e natureza da lesão
create index saude_cat_agente_causador_idx
  on public.saude_cat (agente_causador_codigo)
  where agente_causador_codigo is not null;

create index saude_cat_parte_atingida_idx
  on public.saude_cat (parte_atingida_codigo)
  where parte_atingida_codigo is not null;

create index saude_cat_cid10_idx
  on public.saude_cat (cid10)
  where cid10 is not null;

-- Fila de revisão dos registros antigos truncados
create index saude_cat_truncada_idx
  on public.saude_cat (descricao_truncada)
  where descricao_truncada;

-- ---------------------------------------------------------------------------
-- 5) Padrão do projeto: RLS deny-all (acesso só pelo servidor, service role)
-- ---------------------------------------------------------------------------
alter table public.saude_cat enable row level security;
