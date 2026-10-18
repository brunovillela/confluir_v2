-- Confluir — Saúde/CAT: seção 3, transformação staging -> saude_cat
-- Extraído do saude-cat-carga.sql (mesmo conteúdo, arquivo separado para
-- facilitar a execução). Rodar DEPOIS de importar o CSV na saude_cat_import.
--
-- Pré-requisito: select count(*) from public.saude_cat_import;  -> 13.086
-- Rodar UMA vez só: os UUIDs vêm do Supabase_id, então a segunda execução
-- falha na chave primária em vez de duplicar os registros.

-- ===========================================================================
-- 3) TRANSFORMAÇÃO — staging -> saude_cat
-- ===========================================================================
insert into public.saude_cat (
  id, bubble_id, emp_proprietaria_id,
  emitente, tipo_cat, iniciativa_cat, fonte_cadastramento, numero_cat,
  recibo_esocial,
  empregador_razao_social, empregador_tipo, empregador_inscricao, empregador_cnae,
  trabalhador_nome, trabalhador_cpf, trabalhador_nascimento, trabalhador_sexo,
  trabalhador_estado_civil, trabalhador_cbo_codigo, trabalhador_cbo,
  filiacao_previdencia, areas,
  data_acidente, hora_acidente, horas_trabalhadas_antes, tipo_acidente,
  houve_afastamento, ultimo_dia_trabalhado,
  local_acidente, local_especificacao, local_inscricao, local_uf,
  local_municipio, local_pais,
  parte_atingida_codigo, parte_atingida,
  agente_causador_codigo, agente_causador,
  lateralidade,
  situacao_geradora_codigo, situacao_geradora,
  descricao_truncada,
  houve_registro_policial, houve_morte, data_obito, observacoes_acidente,
  data_recebimento, data_atendimento, hora_atendimento, houve_internacao,
  duracao_tratamento_dias, afastamento_durante_tratamento,
  natureza_lesao_codigo, natureza_lesao, diagnostico_provavel,
  cid10, local_e_data, medico_nome_crm_uf, observacoes_atestado
)
select
  -- Reaproveita o UUID da migração anterior: o CSV traz Supabase_id.
  coalesce(nullif(btrim(i."Supabase_id"), '')::uuid, gen_random_uuid()),
  public.cat_nz(i."unique id"),
  -- Empresa proprietária (NEXT_PUBLIC_EMP_PROPRIETARIA_ID) — mesma das 13.420
  -- linhas da migração anterior.
  'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid,

  -- Identificação (1-6)
  public.cat_nz(i."01 - IDENTIFICAÇÃO Emitente"),
  public.cat_nz(i."02 - IDENTIFICAÇÃO Tipo de CAT"),
  public.cat_nz(i."03 - IDENTIFICAÇÃO Iniciativa da CAT"),
  public.cat_nz(i."04 - IDENTIFICAÇÃO Fonte do Cadastramento"),
  public.cat_nz(i."05 - IDENTIFICAÇÃO Número da CAT"),
  public.cat_nz(i."06 - IDENTIFICAÇÃO Recibo eSocial"),

  -- Empregador (7-10) — razão social em Título conforme especificado
  public.cat_titulo(i."07 - EMPREGADOR Razão Social / Nome"),
  public.cat_nz(i."08 - EMPREGADOR Tipo"),
  public.cat_nz(i."09 - EMPREGADOR Número de Inscrição"),
  public.cat_nz(i."10 - EMPREGADOR CNAE"),

  -- Acidentado (11-18)
  public.cat_titulo(i."11 - ACIDENTADO Nome"),
  -- CPF só entra se tiver exatamente 11 dígitos (o check da tabela exige).
  -- Preenchido em apenas 8 dos 13.086 registros.
  (select case when d ~ '^\d{11}$' then d end
     from (select regexp_replace(coalesce(i."12 - ACIDENTADO CPF", ''), '\D', '', 'g')) s(d)),
  public.cat_data(i."13 - ACIDENTADO Data de Nascimento"),
  public.cat_titulo(i."14 - ACIDENTADO Sexo"),
  public.cat_titulo(i."15 - ACIDENTADO Estado Civil"),
  -- CBO: separa só quando vem "<6 dígitos> - <descrição>" (7.532 linhas).
  -- Os 5.397 colados ("71133Torrista") têm o código mutilado — 5 dígitos onde
  -- o CBO tem 6 — então não são separados: código fica nulo, texto preservado.
  (regexp_match(public.cat_nz(i."16 - ACIDENTADO CBO"), '^(\d{6})\s*-\s*.+$'))[1],
  public.cat_sentenca(
    coalesce((regexp_match(public.cat_nz(i."16 - ACIDENTADO CBO"), '^\d{6}\s*-\s*(.+)$'))[1],
             public.cat_nz(i."16 - ACIDENTADO CBO"))),
  public.cat_nz(i."17 - ACIDENTADO Filiação à PS"),
  public.cat_nz(i."18 - ACIDENTADO Áreas"),

  -- Acidente (19-24)
  public.cat_data(i."19 - ACIDENTE Data do acidente"),
  public.cat_nz(i."20 - ACIDENTE Hora do acidente"),
  public.cat_nz(i."21 - ACIDENTE Após quantas horas de trabalho?"),
  public.cat_nz(i."22 - ACIDENTE Tipo"),
  public.cat_bool(i."23 - ACIDENTE Houve afastamento?"),
  public.cat_data(i."24 - ACIDENTE Último dia trabalhado"),

  -- Local (25-30)
  public.cat_nz(i."25 - ACIDENTE Local do acidente"),
  public.cat_nz(i."26 - ACIDENTE Especificação do local do acidente"),
  public.cat_nz(i."27 - ACIDENTE CNPJ/CAEPF/CNO do local"),
  upper(public.cat_nz(i."28 - ACIDENTE UF")),
  public.cat_nz(i."29 - ACIDENTE Município do local do acidente"),
  public.cat_nz(i."30 - ACIDENTE País"),

  -- Lesão (31-34)
  public.cat_codigo(i."31 - ACIDENTE Parte do corpo atingida"),
  public.cat_descricao(i."31 - ACIDENTE Parte do corpo atingida"),
  public.cat_codigo(i."32 - ACIDENTE Agente causador"),
  public.cat_descricao(i."32 - ACIDENTE Agente causador"),
  public.cat_nz(i."33 - ACIDENTE Lateralidade"),
  public.cat_codigo(i."34 - ACIDENTE Situação geradora"),
  public.cat_descricao(i."34 - ACIDENTE Situação geradora"),

  -- Marca o registro da geração antiga: tem descrição mas não tem código.
  -- É a fila de revisão — nenhum código é inferido por este script.
  (
    (public.cat_nz(i."31 - ACIDENTE Parte do corpo atingida") is not null
      and public.cat_codigo(i."31 - ACIDENTE Parte do corpo atingida") is null)
    or (public.cat_nz(i."32 - ACIDENTE Agente causador") is not null
      and public.cat_codigo(i."32 - ACIDENTE Agente causador") is null)
    or (public.cat_nz(i."34 - ACIDENTE Situação geradora") is not null
      and public.cat_codigo(i."34 - ACIDENTE Situação geradora") is null)
    or (public.cat_nz(i."45 - LESÃO Descrição e natureza da lesão") is not null
      and public.cat_codigo(i."45 - LESÃO Descrição e natureza da lesão") is null)
  ),

  -- Ocorrências (35-38)
  public.cat_bool(i."35 - ACIDENTE Houve registro policial?"),
  public.cat_bool(i."36 - ACIDENTE Houve morte?"),
  public.cat_data(i."37 - ACIDENTE Data do óbito"),
  public.cat_sentenca(i."38 - ACIDENTE Observações"),

  -- Atendimento (39-44)
  public.cat_data(i."39 - ACIDENTE Data do Recebimento"),
  public.cat_data(i."40 - ATENDIMENTO Data"),
  public.cat_nz(i."41 - ATENDIMENTO Hora"),
  public.cat_bool(i."42 - ATENDIMENTO Houve internação?"),
  -- Todos os 2.312 preenchidos são dígitos puros; o guard é defensivo.
  (select case when d ~ '^\d+$' then d::int end
     from (select public.cat_nz(i."43 - ATENDIMENTO Provável Duração do tratamento (dias)")) s(d)),
  public.cat_bool(i."44 - ATENDIMENTO Afastar-se durante tratamento"),

  -- Atestado (45-50)
  public.cat_codigo(i."45 - LESÃO Descrição e natureza da lesão"),
  public.cat_descricao(i."45 - LESÃO Descrição e natureza da lesão"),
  public.cat_sentenca(i."46 - DIAGNÓSTICO Diagnóstico provável"),
  public.cat_cid(i."47 - DIAGNÓSTICO CID"),
  public.cat_nz(i."48 - DIAGNÓSTICO Local e Data"),
  -- 77% são só o número do CRM; a capitalização só afeta os 23% com nome.
  public.cat_titulo(i."49 - DIAGNÓSTICO Nome do médico, CRM e UF"),
  public.cat_sentenca(i."50 - DIAGNÓSTICO Observações")

from public.saude_cat_import i
where public.cat_nz(i."Supabase_id") is not null;
