-- Confluir — Carga das CATs a partir do export do Bubble (2026-07-20)
--
-- Pré-requisito: rodar antes o saude-cat-schema.sql (cria a tabela limpa).
--
-- PRINCÍPIO DESTE SCRIPT: só correção mecânica, nunca invenção.
-- O que é ambíguo ou malformado entra como veio, ou fica nulo e marcado
-- para revisão. Nenhum código de tabela oficial da CAT é inferido.
--
-- Fonte: export_All-Sa-de-CATS-modified_2026-07-20 (13.086 linhas, 53 colunas).
-- Os 334 registros que existem no banco e não no export são descartados
-- (decisão registrada em 20/07/2026) — todos eram cascas sem dado.
--
-- ORDEM DE EXECUÇÃO
--   1. Rodar a seção 1 (staging + funções).
--   2. Importar o CSV para public.saude_cat_import pelo Table Editor.
--   3. Rodar a seção 3 (transformação) e a seção 4 (conferência).
--   4. Rodar a seção 5 (limpeza) só depois de conferir.

-- ===========================================================================
-- 1) STAGING — nomes idênticos aos cabeçalhos do CSV, tudo text
--    Tudo text de propósito: nenhuma linha pode falhar na entrada.
-- ===========================================================================
drop table if exists public.saude_cat_import;

create table public.saude_cat_import (
  "00 EMPREGADOR" text,
  "01 - IDENTIFICAÇÃO Emitente" text,
  "02 - IDENTIFICAÇÃO Tipo de CAT" text,
  "03 - IDENTIFICAÇÃO Iniciativa da CAT" text,
  "04 - IDENTIFICAÇÃO Fonte do Cadastramento" text,
  "05 - IDENTIFICAÇÃO Número da CAT" text,
  -- Encurtado: o cabeçalho original do CSV tem 76 bytes e o Postgres trunca
  -- identificadores em 63, o que quebrava o casamento no import. Ver nota
  -- no fim do arquivo.
  "06 - IDENTIFICAÇÃO Recibo eSocial" text,
  "07 - EMPREGADOR Razão Social / Nome" text,
  "08 - EMPREGADOR Tipo" text,
  "09 - EMPREGADOR Número de Inscrição" text,
  "10 - EMPREGADOR CNAE" text,
  "11 - ACIDENTADO Nome" text,
  "12 - ACIDENTADO CPF" text,
  "13 - ACIDENTADO Data de Nascimento" text,
  "14 - ACIDENTADO Sexo" text,
  "15 - ACIDENTADO Estado Civil" text,
  "16 - ACIDENTADO CBO" text,
  "17 - ACIDENTADO Filiação à PS" text,
  "18 - ACIDENTADO Áreas" text,
  "19 - ACIDENTE Data do acidente" text,
  "20 - ACIDENTE Hora do acidente" text,
  "21 - ACIDENTE Após quantas horas de trabalho?" text,
  "22 - ACIDENTE Tipo" text,
  "23 - ACIDENTE Houve afastamento?" text,
  "24 - ACIDENTE Último dia trabalhado" text,
  "25 - ACIDENTE Local do acidente" text,
  "26 - ACIDENTE Especificação do local do acidente" text,
  "27 - ACIDENTE CNPJ/CAEPF/CNO do local" text,
  "28 - ACIDENTE UF" text,
  "29 - ACIDENTE Município do local do acidente" text,
  "30 - ACIDENTE País" text,
  "31 - ACIDENTE Parte do corpo atingida" text,
  "32 - ACIDENTE Agente causador" text,
  "33 - ACIDENTE Lateralidade" text,
  "34 - ACIDENTE Situação geradora" text,   -- encurtado (original: 71 bytes)
  "35 - ACIDENTE Houve registro policial?" text,
  "36 - ACIDENTE Houve morte?" text,
  "37 - ACIDENTE Data do óbito" text,
  "38 - ACIDENTE Observações" text,
  "39 - ACIDENTE Data do Recebimento" text,
  "40 - ATENDIMENTO Data" text,
  "41 - ATENDIMENTO Hora" text,
  "42 - ATENDIMENTO Houve internação?" text,
  "43 - ATENDIMENTO Provável Duração do tratamento (dias)" text,
  "44 - ATENDIMENTO Afastar-se durante tratamento" text,  -- encurtado (82 bytes)
  "45 - LESÃO Descrição e natureza da lesão" text,
  "46 - DIAGNÓSTICO Diagnóstico provável" text,
  "47 - DIAGNÓSTICO CID" text,
  "48 - DIAGNÓSTICO Local e Data" text,
  "49 - DIAGNÓSTICO Nome do médico, CRM e UF" text,
  "50 - DIAGNÓSTICO Observações" text,
  "Supabase_id" text,
  "unique id" text
);

-- ===========================================================================
-- 2) FUNÇÕES DE NORMALIZAÇÃO
-- ===========================================================================

-- nz: trim + string vazia vira null (o CSV traz '' onde não há dado)
create or replace function public.cat_nz(p text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), '')
$$;

-- Data: o export traz DOIS formatos na mesma coluna —
--   "May 8, 1982 12:00 am"  (inglês, 7.6k linhas)
--   "jan. 4, 2019 00:00"    (português, 5.5k linhas)
-- Ambos têm a forma "<mês> <dia>, <ano>", então um regex só resolve os dois;
-- o mapa de meses cobre as abreviações das duas línguas.
-- Fora do padrão retorna null (não chuta data).
create or replace function public.cat_data(p text)
returns date language plpgsql immutable as $$
declare
  v   text := public.cat_nz(p);
  m   text[];
  mes int;
begin
  if v is null then return null; end if;

  m := regexp_match(v, '^([A-Za-zçÇ]+)\.?\s+(\d{1,2}),\s*(\d{4})');
  if m is null then return null; end if;

  mes := case lower(left(m[1], 3))
    when 'jan' then 1
    when 'fev' then 2  when 'feb' then 2
    when 'mar' then 3
    when 'abr' then 4  when 'apr' then 4
    when 'mai' then 5  when 'may' then 5
    when 'jun' then 6
    when 'jul' then 7
    when 'ago' then 8  when 'aug' then 8
    when 'set' then 9  when 'sep' then 9
    when 'out' then 10 when 'oct' then 10
    when 'nov' then 11
    when 'dez' then 12 when 'dec' then 12
    else null
  end;
  if mes is null then return null; end if;

  return make_date(m[3]::int, mes, m[2]::int);
exception when others then
  return null;   -- data impossível (ex.: 31 de fevereiro) não derruba a carga
end $$;

-- Sim/Não -> boolean. O export tem 'Sim','Não','não','NÃO','TRUE','FALSE'.
-- Qualquer outra coisa vira null.
create or replace function public.cat_bool(p text)
returns boolean language sql immutable as $$
  select case lower(public.cat_nz(p))
    when 'sim'   then true
    when 'true'  then true
    when 'não'   then false
    when 'nao'   then false
    when 'false' then false
    else null
  end
$$;

-- Título: primeira letra de cada palavra maiúscula (campos 7, 11, 14, 15, 49).
--   "HALLIBURTON PRODUTOS LTDA"        -> "Halliburton Produtos Ltda"
--   "PETROLEO BRASILEIRO S A PETROBRAS"-> "Petroleo Brasileiro S A Petrobras"
--   "ODEBRECHT OLEO E GAS S/A"         -> "Odebrecht Oleo e Gas S/A"
--
-- Duas ressalvas ao initcap() puro, ambas verificadas contra o export:
--  a) Partículas ficam minúsculas fora da primeira palavra — convenção do
--     português ("Baker Hughes do Brasil", não "Do Brasil").
--  b) Iniciais e siglas com barra/ponto ficam intactas. Sem isso, "S A" de
--     "S A PETROBRAS" viraria "S a" e "S/A" viraria "S/a".
-- A ordem dos ramos importa: a partícula 'e' tem 1 caractere e seria capturada
-- pela regra de sigla se ela viesse antes.
create or replace function public.cat_titulo(p text)
returns text language sql immutable as $$
  select nullif(btrim(string_agg(
    case
      when palavra = '' then ''
      when ord > 1 and lower(palavra) in ('da','de','do','das','dos','e')
        then lower(palavra)
      when length(palavra) <= 2 or palavra like '%/%' or palavra like '%.%'
        then upper(palavra)
      else upper(left(palavra, 1)) || lower(substr(palavra, 2))
    end, ' ' order by ord), ''), '')
  from regexp_split_to_table(public.cat_nz(p), '\s+') with ordinality as t(palavra, ord)
$$;

-- Sentença: só a primeira letra maiúscula, resto minúsculo.
create or replace function public.cat_sentenca(p text)
returns text language sql immutable as $$
  select case
    when public.cat_nz(p) is null then null
    else upper(left(public.cat_nz(p), 1)) || lower(substr(public.cat_nz(p), 2))
  end
$$;

-- Separa "<código 9 dígitos> – <DESCRIÇÃO>" (campos 31, 32, 34, 45).
-- O separador é travessão (–), mas aceita hífen e meia-risca. Corta no
-- PRIMEIRO separador: a descrição do campo 32 contém outro travessão.
-- Sem código (registros antigos) devolve null.
create or replace function public.cat_codigo(p text)
returns text language sql immutable as $$
  select (regexp_match(public.cat_nz(p), '^(\d{9})\s*[–—-]\s*.+$'))[1]
$$;

-- Descrição correspondente, já em sentença. Sem código, devolve o valor
-- original em sentença — é o texto truncado do legado, preservado como veio.
create or replace function public.cat_descricao(p text)
returns text language sql immutable as $$
  select public.cat_sentenca(
    coalesce((regexp_match(public.cat_nz(p), '^\d{9}\s*[–—-]\s*(.+)$'))[1],
             public.cat_nz(p))
  )
$$;

-- CID-10: normaliza só o que é mecânico. O formato é sempre letra + 2 dígitos
-- (categoria) + subcategoria opcional de 1 dígito, o que torna as correções
-- abaixo inequívocas. Medido no export (13.020 preenchidos):
--   9.896 já canônicos          "W57"    "M54.5"
--     642 separador errado      "S01 4"  "S62-5"  -> S01.4  S62.5
--   2.421 ponto omitido         "S015"   "T150"   -> S01.5  T15.0
--       9 separador sobrando    "S51-"            -> S51
--      52 fora de padrão        "S93 A"  "~S934"  "5611"  "AS400"
-- Os 52 ficam como vieram, em caixa alta, para revisão manual. Não são
-- corrigidos por inferência: "T-232" tanto poderia ser T23.2 quanto T2.32.
create or replace function public.cat_cid(p text)
returns text language sql immutable as $$
  with v as (select upper(public.cat_nz(p)) as x)
  select case
    when x is null then null
    when x ~ '^[A-Z]\d{2}(\.\d)?$' then x
    when x ~ '^[A-Z]\d{2}[\s.\-]+\d$'
      then regexp_replace(x, '^([A-Z]\d{2})[\s.\-]+(\d)$', '\1.\2')
    when x ~ '^[A-Z]\d{3}$'
      then regexp_replace(x, '^([A-Z]\d{2})(\d)$', '\1.\2')
    when x ~ '^[A-Z]\d{2}[\s.\-]+$'
      then regexp_replace(x, '^([A-Z]\d{2})[\s.\-]+$', '\1')
    else x
  end
  from v
$$;

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

-- ===========================================================================
-- 4) CONFERÊNCIA — rodar e comparar com os números da análise do CSV
-- ===========================================================================
-- Total esperado: 13.086
--   select count(*) from public.saude_cat;
--
-- Datas: nenhuma deve falhar (os dois formatos cobrem 100% do export)
--   select count(*) filter (where data_acidente is null)      as sem_data_acidente,
--          count(*) filter (where trabalhador_nascimento is null) as sem_nascimento
--   from public.saude_cat;
--   -- esperado ~5 e ~28 (os que já vinham vazios no CSV)
--
-- Códigos recuperados (esperado ~2.5k em cada, ~19%)
--   select count(*) filter (where parte_atingida_codigo    is not null) as c31,
--          count(*) filter (where agente_causador_codigo   is not null) as c32,
--          count(*) filter (where situacao_geradora_codigo is not null) as c34,
--          count(*) filter (where natureza_lesao_codigo    is not null) as c45
--   from public.saude_cat;
--
-- Fila de revisão (esperado ~10.5k)
--   select count(*) from public.saude_cat where descricao_truncada;
--
-- CID fora do padrão — revisão manual (esperado 52 linhas, 47 valores distintos)
--   select cid10, count(*) from public.saude_cat
--   where cid10 is not null and cid10 !~ '^[A-Z]\d{2}(\.\d)?$'
--   group by 1 order by 2 desc;
--
-- Amostra visual da normalização
--   select numero_cat, empregador_razao_social, trabalhador_nome,
--          parte_atingida_codigo, parte_atingida, cid10
--   from public.saude_cat order by data_acidente desc limit 20;

-- ===========================================================================
-- 5) LIMPEZA — só depois de conferir a seção 4
-- ===========================================================================
-- A staging é o único registro do valor original antes da normalização.
-- Não descartar antes de validar a carga.
--
--   drop table public.saude_cat_import;
--
-- As funções cat_* podem ficar: servem para a entrada manual de CATs novas.

-- ===========================================================================
-- NOTA — o limite de 63 bytes do Postgres
-- ===========================================================================
-- Três cabeçalhos do CSV original estouram o limite de identificador do
-- Postgres (NAMEDATALEN = 64, ou seja 63 bytes úteis). Ao criar a tabela, o
-- Postgres TRUNCA o nome silenciosamente — sem erro, sem aviso. O import
-- então falha com "columns are not present in your table", porque o
-- cabeçalho do CSV é mais longo que a coluna criada.
--
-- Atenção: o limite é em BYTES, não em caracteres. Cada acento em UTF-8
-- ocupa 2 bytes, então "IDENTIFICAÇÃO" custa 15 bytes para 13 caracteres.
--
--   original (bytes)                                        -> encurtado
--   "06 - IDENTIFICAÇÃO Número do Recibo do evento no        -> "06 - IDENTIFICAÇÃO
--    eSocial da CAT de origem"                        (76)      Recibo eSocial"
--   "34 - ACIDENTE Descrição da situação geradora            -> "34 - ACIDENTE
--    do acidente ou doença"                           (71)      Situação geradora"
--   "44 - ATENDIMENTO Deverá o acidentado afastar-se         -> "44 - ATENDIMENTO
--    do trabalho durante o tratamento?"               (82)      Afastar-se durante
--                                                              tratamento"
--
-- O CSV correspondente, com esses três cabeçalhos já ajustados e os dados
-- preservados byte a byte, é o saude_cat_import_CORRIGIDO.csv.
--
-- Se um novo export do Bubble for usado no futuro, conferir antes:
--   os cabeçalhos com mais de 63 bytes precisam ser encurtados no CSV E aqui.
