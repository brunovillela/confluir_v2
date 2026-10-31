<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Representação, acordos e negociações

17 tabelas. Diagrama: [er/representacao.md](../er/representacao.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [acordo_clausulas](#acordo_clausulas) | — | Cada cláusula de um acordo ou convenção coletiva, separada do texto integral pela IA ou à mão em Representação > Acordos. Base da busca por … |
| [acordo_coletivo](#acordo_coletivo) | — | Acordo coletivo (ACT) ou convenção (CCT) cadastrado em Representação > Acordos, com vigência, PDF e texto integral extraído. Também guarda d… |
| [acordo_comparacao_pares](#acordo_comparacao_pares) | — | Par de cláusulas (acordo A x acordo B) de uma comparação de ACTs, com situação (igual, alterada, nova, suprimida), resumo da mudança e avali… |
| [acordo_comparacoes](#acordo_comparacoes) | — | Comparação entre dois acordos coletivos criada no Comparador de ACTs; os pares de cláusulas ficam em acordo_comparacao_pares. |
| [acordo_fontes](#acordo_fontes) | — | Junção acordo coletivo x fonte pagadora (empresa) abrangida pelo acordo. |
| [agenda](#agenda) | identificação, **sensível: sindical** | Compromisso da agenda institucional (reunião, assembleia, evento, compromisso avulso), gravado pela tela Ferramentas > Agendas ou gerado por… |
| [agenda_representantes](#agenda_representantes) | identificação | Participantes (usuários representantes) de um compromisso da agenda. Tabela vazia; não veio dado na migração do Bubble e o código não a usa. |
| [ato_eventos](#ato_eventos) | identificação | Atos e mobilizações sindicais (nome, cidade, fotos, período). Sem uso encontrado no código (possível legado do Bubble), tabela vazia. |
| [ato_eventos_participantes](#ato_eventos_participantes) | **sensível: sindical** | Junção ato x usuário participante. Sem uso encontrado no código (possível legado do Bubble), tabela vazia. |
| [negociacao_empresas](#negociacao_empresas) | — | Junção negociação coletiva x empresa (fonte pagadora) envolvida. |
| [negociacao_eventos](#negociacao_eventos) | — | Linha do tempo de uma negociação coletiva: reuniões, propostas e marcos registrados no painel de Negociações. |
| [negociacoes](#negociacoes) | — | Negociação coletiva (ACT ou CCT) com data-base, situação, acordo vigente e final, e a campanha de votação ligada. Tela Representação > Negoc… |
| [representacao_documentos](#representacao_documentos) | — | Documentos de representação por empregador (cartas, termos, registros), com vigência e arquivo, em Representação > Empregadores. |
| [representacao_reuniao_participantes](#representacao_reuniao_participantes) | identificação, **sensível: sindical**, trabalhista | Participante de uma reunião com empregador ou setorial, do lado do sindicato, da empresa ou dos trabalhadores, com nome e cargo. |
| [representacao_reunioes](#representacao_reunioes) | identificação | Reunião com empregador ou setorial registrada em Representação > Empregadores, com pauta, resumo (opcionalmente por IA a partir da ata), enc… |
| [reuniao_ata](#reuniao_ata) | identificação, **sensível: sindical** | Ata de reunião da diretoria, conselho fiscal ou assembleia, ligada ao mandato, com pauta, resumo, presentes e o PDF; as deliberações ficam e… |
| [reuniao_deliberacao](#reuniao_deliberacao) | identificação, **sensível: sindical** | Deliberação (decisão) de uma reunião registrada em ata: assunto, teor, votação, responsável, prazo, situação do cumprimento e grau de sigilo… |

## acordo_clausulas

Cada cláusula de um acordo ou convenção coletiva, separada do texto integral pela IA ou à mão em Representação > Acordos. Base da busca por tema e do comparador de ACTs.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `acordo_id` | uuid | sim |  | → acordo_coletivo (**cascade**) |  |  |
| `numero` | text | sim |  |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `texto` | text | sim |  |  |  |  |
| `categoria` | text | não | `'outro'::text` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `tema` | text | sim |  |  |  | Tema (lista em src/lib/acordos-constantes.ts: TEMAS_CLAUSULA). Sugerido pela IA na extração; a entidade corrige. |
| `grupo` | text | sim |  |  |  | Agrupamento da cláusula (capítulo ou seção do acordo) usado para ordenar. |
| `resumo` | text | sim |  |  |  |  |
| `numero_ordem` | integer | sim |  |  |  | Número da cláusula convertido em inteiro para ordenar e parear na comparação. |
| `origem` | text | não | `'manual'::text` |  |  | Como a cláusula foi criada: manual ou extracao (separação automática pela IA). |

Checks: `acordo_clausulas_categoria_check` `CHECK ((categoria = ANY (ARRAY['reajuste'::text, 'beneficio'::text, 'jornada'::text, 'saude'::text, 'seguranca'::text, 'outro'::text])))`

Índices: `acordo_clausulas_pkey`, `idx_acordo_clausulas_acordo`, `idx_acordo_clausulas_tema`

## acordo_coletivo

Acordo coletivo (ACT) ou convenção (CCT) cadastrado em Representação > Acordos, com vigência, PDF e texto integral extraído. Também guarda documentos sigilosos de uma negociação (pauta, proposta) quando negociacao_id está preenchido.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `tipo` | text | não | `'act'::text` |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `numero_registro` | text | sim |  |  |  |  |
| `data_base` | text | sim |  |  |  |  |
| `vigencia_inicio` | date | sim |  |  |  |  |
| `vigencia_fim` | date | sim |  |  |  |  |
| `abrangencia` | text | sim |  |  |  |  |
| `situacao` | text | não | `'em_negociacao'::text` |  |  |  |
| `documento_url` | text | sim |  |  |  |  |
| `observacoes` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `com_funcionarios_entidade` | boolean | não | `false` |  |  | Marca o acordo que vale para os funcionários da própria entidade sindical. |
| `texto_integral` | text | sim |  |  |  | Texto extraído do PDF (base da separação em cláusulas e da busca). |
| `preambulo` | text | sim |  |  |  |  |
| `anexos` | text | sim |  |  |  |  |
| `extracao_em` | timestamp with time zone | sim |  |  |  |  |
| `extracao_avisos` | text | sim |  |  |  | Avisos da IA ao extrair o texto e separar as cláusulas. |
| `clausulas_revisadas_em` | timestamp with time zone | sim |  |  |  |  |
| `clausulas_revisadas_por_id` | uuid | sim |  | → usuarios |  | Usuário do painel que revisou as cláusulas extraídas. |
| `negociacao_id` | uuid | sim |  | → negociacoes (**cascade**) |  | Documento sigiloso de uma negociação (pauta/proposta). Some de Acordos coletivos; ao concluir, o final perde o vínculo e vira vigente. |
| `papel_negociacao` | text | sim |  |  |  | Papel do documento dentro da negociação: pauta, proposta, contraproposta etc. |
| `rodada_negociacao` | integer | sim |  |  |  | Número da rodada da negociação a que o documento pertence. |
| `data_documento` | date | sim |  |  |  |  |

Checks: `acordo_coletivo_situacao_check` `CHECK ((situacao = ANY (ARRAY['em_negociacao'::text, 'vigente'::text, 'arquivado'::text])))`; `acordo_coletivo_tipo_check` `CHECK ((tipo = ANY (ARRAY['act'::text, 'cct'::text])))`

Índices: `acordo_coletivo_pkey`, `idx_acordo_emp`, `idx_acordo_negociacao`, `idx_acordo_vigencia`

## acordo_comparacao_pares

Par de cláusulas (acordo A x acordo B) de uma comparação de ACTs, com situação (igual, alterada, nova, suprimida), resumo da mudança e avaliação favorável/desfavorável pela IA ou manual.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `comparacao_id` | uuid | sim |  | → acordo_comparacoes (**cascade**) |  |  |
| `clausula_a_id` | uuid | sim |  | → acordo_clausulas (set null) |  |  |
| `clausula_b_id` | uuid | sim |  | → acordo_clausulas (set null) |  |  |
| `situacao` | text | não | `'alterada'::text` |  |  |  |
| `origem_par` | text | sim |  |  |  | Como o par foi formado: automático (similaridade/IA) ou manual. |
| `similaridade` | numeric | sim |  |  |  | Grau de semelhança textual entre as duas cláusulas, de 0 a 1. |
| `tema` | text | sim |  |  |  |  |
| `resumo_mudanca` | text | sim |  |  |  |  |
| `avaliacao` | text | sim |  |  |  |  |
| `avaliacao_motivo` | text | sim |  |  |  |  |
| `avaliacao_manual` | boolean | não | `false` |  |  | Verdadeiro quando a avaliação foi ajustada por uma pessoa, não pela IA. |
| `ordem` | integer | não | `0` |  |  |  |

Checks: `acordo_comparacao_pares_avaliacao_check` `CHECK (((avaliacao IS NULL) OR (avaliacao = ANY (ARRAY['favoravel'::text, 'desfavoravel'::text, 'neutra'::text]))))`; `acordo_comparacao_pares_situacao_check` `CHECK ((situacao = ANY (ARRAY['igual'::text, 'alterada'::text, 'nova'::text, 'suprimida'::text])))`

Índices: `acordo_comparacao_pares_pkey`, `idx_acordo_comparacao_pares`

## acordo_comparacoes

Comparação entre dois acordos coletivos criada no Comparador de ACTs; os pares de cláusulas ficam em acordo_comparacao_pares.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `acordo_a_id` | uuid | sim |  | → acordo_coletivo (**cascade**) |  |  |
| `acordo_b_id` | uuid | sim |  | → acordo_coletivo (**cascade**) |  |  |
| `titulo` | text | sim |  |  |  |  |
| `analise_avisos` | text | sim |  |  |  | Avisos da IA durante a análise da comparação. |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `acordo_comparacoes_pkey`, `idx_acordo_comparacoes_emp`

## acordo_fontes

Junção acordo coletivo x fonte pagadora (empresa) abrangida pelo acordo.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `acordo_id` | uuid | sim |  | → acordo_coletivo (**cascade**) |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (acordo_id, empresa_id)`

Índices: `acordo_fontes_acordo_id_empresa_id_key`, `acordo_fontes_pkey`, `idx_acordo_fontes_acordo`

## agenda

Compromisso da agenda institucional (reunião, assembleia, evento, compromisso avulso), gravado pela tela Ferramentas > Agendas ou gerado por assembleias/eventos. Origem Bubble para os antigos (bubble_id).

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados, diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `atividade` | text | sim |  |  | identificação | Título do compromisso; pode citar nomes de pessoas. |
| `local` | text | sim |  |  |  |  |
| `inicio` | timestamp with time zone | sim |  |  |  |  |
| `termino` | timestamp with time zone | sim |  |  |  |  |
| `dia_todo` | boolean | sim | `false` |  |  |  |
| `aplicativo` | boolean | sim | `false` |  |  | Se o compromisso aparece no aplicativo/portal (herança do Bubble). |
| `evento_interno` | boolean | sim | `false` |  |  |  |
| `informacoes_gerais` | text | sim |  |  | identificação | Texto livre do compromisso; pode conter nomes e contatos. |
| `tipo` | text | sim |  |  |  |  |
| `sede_os` | text | sim |  |  |  | Sede como texto do Bubble (option set), antes da normalização em sede_id. |
| `projeto_id` | uuid | sim |  |  |  |  |
| `sede_id` | uuid | sim |  | → empresa_sede |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `filiacao_id` | uuid | sim |  | → filiacoes | **sensível: sindical** | Filiado ligado ao compromisso (ex.: atendimento); revela a filiação. |
| `assembleia_id` | uuid | sim |  | → voto_assembleias (**cascade**) |  |  |
| `evento_id` | uuid | sim |  | → eventos (set null) |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `agenda_bubble_id_key`, `agenda_pkey`, `idx_agenda_assembleia`, `idx_agenda_evento`, `idx_agenda_inicio`

## agenda_representantes

Participantes (usuários representantes) de um compromisso da agenda. Tabela vazia; não veio dado na migração do Bubble e o código não a usa.

- **LGPD:** identificação · titulares: diretores, usuários do sistema
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `agenda_id` | uuid | não |  | → agenda (**cascade**) |  |  |
| 🔑 `usuario_id` | uuid | não |  | → usuarios (**cascade**) |  |  |

Índices: `agenda_representantes_pkey`

## ato_eventos

Atos e mobilizações sindicais (nome, cidade, fotos, período). Sem uso encontrado no código (possível legado do Bubble), tabela vazia.

- **LGPD:** identificação · titulares: público externo (pessoas em fotos de atos)
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome_ato` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `cidade` | text | sim |  |  |  |  |
| `links` | text | sim |  |  |  |  |
| `fotos` | text[] | sim |  |  | identificação | Fotos do ato; podem mostrar rostos de participantes. |
| `detalhamento` | text | sim |  |  |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |  |  |
| `data_hora_termino` | timestamp with time zone | sim |  |  |  |  |
| `emp_contratante_id` | uuid | sim |  | → empresa |  | Tenant no padrão antigo do Bubble (equivale a emp_proprietaria_id). |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `ato_eventos_bubble_id_key`, `ato_eventos_pkey`

## ato_eventos_participantes

Junção ato x usuário participante. Sem uso encontrado no código (possível legado do Bubble), tabela vazia.

- **LGPD:** **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `evento_id` | uuid | não |  | → ato_eventos (**cascade**) |  |  |
| 🔑 `usuario_id` | uuid | não |  | → usuarios (**cascade**) | **sensível: sindical** | Participação da pessoa em ato sindical revela posição sindical. |

Índices: `ato_eventos_participantes_pkey`

## negociacao_empresas

Junção negociação coletiva x empresa (fonte pagadora) envolvida.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `negociacao_id` | uuid | sim |  | → negociacoes (**cascade**) |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |

Índices: `negociacao_empresas_pkey`, `uq_negociacao_empresas`

## negociacao_eventos

Linha do tempo de uma negociação coletiva: reuniões, propostas e marcos registrados no painel de Negociações.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `negociacao_id` | uuid | sim |  | → negociacoes (**cascade**) |  |  |
| `data` | date | não | `CURRENT_DATE` |  |  |  |
| `tipo` | text | não | `'reuniao'::text` |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_negociacao_eventos`, `negociacao_eventos_pkey`

## negociacoes

Negociação coletiva (ACT ou CCT) com data-base, situação, acordo vigente e final, e a campanha de votação ligada. Tela Representação > Negociações.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `titulo` | text | sim |  |  |  |  |
| `tipo` | text | não | `'act'::text` |  |  |  |
| `data_base` | text | sim |  |  |  |  |
| `situacao` | text | não | `'preparacao'::text` |  |  |  |
| `acordo_vigente_id` | uuid | sim |  | → acordo_coletivo (set null) |  |  |
| `acordo_final_id` | uuid | sim |  | → acordo_coletivo (set null) |  |  |
| `campanha_id` | uuid | sim |  | → voto_campanha (set null) |  |  |
| `inicio` | date | sim |  |  |  |  |
| `conclusao` | date | sim |  |  |  |  |
| `observacoes` | text | sim |  |  |  |  |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_negociacoes_emp`, `negociacoes_pkey`

## representacao_documentos

Documentos de representação por empregador (cartas, termos, registros), com vigência e arquivo, em Representação > Empregadores.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `empresa_id` | uuid | sim |  | → empresa (**cascade**) |  |  |
| `tipo` | text | não | `'outro'::text` |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `numero` | text | sim |  |  |  |  |
| `data_documento` | date | sim |  |  |  |  |
| `vigencia_fim` | date | sim |  |  |  |  |
| `arquivo_url` | text | sim |  |  |  |  |
| `observacoes` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `representacao_documentos_tipo_check` `CHECK ((tipo = ANY (ARRAY['carta_sindical'::text, 'ata'::text, 'edital'::text, 'procuracao'::text, 'acordo'::text, 'outro'::text])))`

Índices: `idx_rep_docs_emp`, `idx_rep_docs_empresa`, `representacao_documentos_pkey`

## representacao_reuniao_participantes

Participante de uma reunião com empregador ou setorial, do lado do sindicato, da empresa ou dos trabalhadores, com nome e cargo.

- **LGPD:** identificação, **sensível: sindical**, trabalhista · titulares: diretores, representantes de empresa e trabalhadores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `reuniao_id` | uuid | sim |  | → representacao_reunioes (**cascade**) |  |  |
| `lado` | text | não | `'sindicato'::text` |  | **sensível: sindical** | sindicato, empresa ou trabalhador. |
| `usuario_id` | uuid | sim |  | → usuarios (set null) |  |  |
| `nome` | text | sim |  |  | identificação |  |
| `cargo` | text | sim |  |  | trabalhista |  |
| `ordem` | integer | não | `0` |  |  |  |

Índices: `idx_representacao_reuniao_participantes`, `representacao_reuniao_participantes_pkey`

## representacao_reunioes

Reunião com empregador ou setorial registrada em Representação > Empregadores, com pauta, resumo (opcionalmente por IA a partir da ata), encaminhamentos e ata anexada.

- **LGPD:** identificação · titulares: trabalhadores e representantes citados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `empresa_id` | uuid | sim |  | → empresa (**cascade**) |  |  |
| `tipo` | text | não | `'empregador'::text` |  |  |  |
| `situacao` | text | não | `'realizada'::text` |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `data` | date | sim |  |  |  |  |
| `hora_inicio` | text | sim |  |  |  |  |
| `hora_fim` | text | sim |  |  |  |  |
| `modalidade` | text | não | `'presencial'::text` |  |  |  |
| `local` | text | sim |  |  |  |  |
| `link_online` | text | sim |  |  |  |  |
| `unidade` | text | sim |  |  |  |  |
| `presentes_total` | integer | sim |  |  |  | Número de trabalhadores presentes. |
| `pauta` | text | sim |  |  |  |  |
| `resumo` | text | sim |  |  | identificação | Texto livre que pode citar trabalhadores. |
| `encaminhamentos` | text | sim |  |  | identificação |  |
| `ata_caminho` | text | sim |  |  | identificação | Ata da reunião; costuma listar presentes. |
| `ata_nome` | text | sim |  |  |  |  |
| `resumo_por_ia` | boolean | não | `false` |  |  | Resumo gerado pela IA a partir da ata. |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_representacao_reunioes_empresa`, `representacao_reunioes_pkey`

## reuniao_ata

Ata de reunião da diretoria, conselho fiscal ou assembleia, ligada ao mandato, com pauta, resumo, presentes e o PDF; as deliberações ficam em reuniao_deliberacao.

- **LGPD:** identificação, **sensível: sindical** · titulares: diretores e participantes
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `mandato_id` | uuid | sim |  | → diretoria_mandatos |  |  |
| `tipo` | text | não | `'diretoria'::text` |  |  |  |
| `orgao` | text | sim |  |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `data` | date | sim |  |  |  |  |
| `hora` | text | sim |  |  |  |  |
| `local` | text | sim |  |  |  |  |
| `pauta` | text | sim |  |  |  |  |
| `resumo` | text | sim |  |  | identificação | Breve resumo da reunião (o que se discutiu). As decisões ficam em reuniao_deliberacao, com situação e sigilo. |
| `presentes` | text | sim |  |  | **sensível: sindical** | Nomes dos presentes em reunião de órgão sindical. |
| `observacoes` | text | sim |  |  | identificação |  |
| `documento_url` | text | sim |  |  | identificação |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `reuniao_ata_tipo_check` `CHECK ((tipo = ANY (ARRAY['diretoria'::text, 'conselho_fiscal'::text, 'assembleia'::text, 'outra'::text])))`

Índices: `idx_reuniao_ata_data`, `idx_reuniao_ata_emp`, `idx_reuniao_ata_mandato`, `reuniao_ata_pkey`

## reuniao_deliberacao

Deliberação (decisão) de uma reunião registrada em ata: assunto, teor, votação, responsável, prazo, situação do cumprimento e grau de sigilo. Consulta em Institucional › Deliberações.

- **LGPD:** identificação, **sensível: sindical** · titulares: diretores e participantes
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `ata_id` | uuid | não |  | → reuniao_ata (**cascade**) | nenhum | Ata da reunião em que a decisão foi tomada; a data da deliberação é a da ata. |
| `ordem` | integer | não | `1` |  | nenhum | Posição da deliberação na ata (1, 2, 3…). |
| `assunto` | text | não |  |  | identificação | Assunto curto da decisão, usado na busca e nos filtros. |
| `texto` | text | sim |  |  | identificação | Teor da decisão como deliberado. |
| `votacao` | text | sim |  |  | identificação | Resultado da votação, quando houve (ex.: "aprovada por unanimidade", "5 a 2"). |
| `responsavel` | text | sim |  |  | identificação | Quem ficou encarregado de cumprir a decisão (texto livre). |
| `prazo` | date | sim |  |  | nenhum | Prazo para cumprir a decisão, quando fixado. |
| `situacao` | text | não | `'a_cumprir'::text` |  | nenhum | a_cumprir, em_execucao, cumprida ou cancelada. |
| `sigilo` | text | não | `'reservado'::text` |  | nenhum | livre, reservado ou restrito: quem pode consultar depende do nível de sigilo concedido ao usuário. |
| `criado_por` | uuid | sim |  |  | identificação | Usuário que registrou a deliberação. |
| `atualizado_por` | uuid | sim |  |  | identificação | Usuário que alterou a deliberação por último. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `reuniao_deliberacao_sigilo_check` `CHECK ((sigilo = ANY (ARRAY['livre'::text, 'reservado'::text, 'restrito'::text])))`; `reuniao_deliberacao_situacao_check` `CHECK ((situacao = ANY (ARRAY['a_cumprir'::text, 'em_execucao'::text, 'cumprida'::text, 'cancelada'::text])))`

Índices: `reuniao_deliberacao_ata_idx`, `reuniao_deliberacao_emp_situacao_idx`, `reuniao_deliberacao_pkey`
