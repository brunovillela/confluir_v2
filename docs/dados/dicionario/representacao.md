<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Representação, acordos e negociações

27 tabelas. Diagrama: [er/representacao.md](../er/representacao.md).

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
| [congresso_config_versoes](#congresso_config_versoes) | — | Histórico da configuração de cada congresso (só inserção): quem mudou, por quê e, depois da aprovação do regimento, a deliberação que autori… |
| [congresso_eixos](#congresso_eixos) | — | Eixos temáticos do congresso. |
| [congresso_grupos](#congresso_grupos) | — | Grupos de trabalho (GT) do congresso, com eixo e vagas. |
| [congresso_papeis](#congresso_papeis) | — | Papéis do congresso (delegado, nato, suplente, observador, convidado…) com a matriz de direitos em jsonb (voz, voto, assinar moção, candidat… |
| [congresso_participante_historico](#congresso_participante_historico) | **sensível: sindical** | Trilha de cada participante (só inserção): inscrição, troca de papel ou base, lista de espera, cancelamento. |
| [congresso_participantes](#congresso_participantes) | identificação, **sensível: sindical** | Pessoas do congresso: delegados, natos, suplentes, observadores, convidados. Podem ser filiados ou não. A participação revela atuação sindic… |
| [congresso_sessoes](#congresso_sessoes) | — | Sessões do programa (plenária, mesa, grupo, setorial, atividade conjunta…), com horário. |
| [congresso_unidades](#congresso_unidades) | — | Bases, entidades, segmentos ou ramos que formam as delegações, com limite de delegados e número de sócios para o cálculo de vagas. |
| [congressos](#congressos) | — | Congressos, plenárias e conferências que a entidade promove ou de que participa. Cada um aponta para um evento do módulo Eventos e guarda a … |
| [negociacao_empresas](#negociacao_empresas) | — | Junção negociação coletiva x empresa (fonte pagadora) envolvida. |
| [negociacao_eventos](#negociacao_eventos) | — | Linha do tempo de uma negociação coletiva: reuniões, propostas e marcos registrados no painel de Negociações. |
| [negociacoes](#negociacoes) | — | Negociação coletiva (ACT ou CCT) com data-base, situação, acordo vigente e final, e a campanha de votação ligada. Tela Representação > Negoc… |
| [representacao_documentos](#representacao_documentos) | — | Documentos de representação por empregador (cartas, termos, registros), com vigência e arquivo, em Representação > Empregadores. |
| [representacao_reuniao_participantes](#representacao_reuniao_participantes) | identificação, **sensível: sindical**, trabalhista | Participante de uma reunião com empregador ou setorial, do lado do sindicato, da empresa ou dos trabalhadores, com nome e cargo. |
| [representacao_reunioes](#representacao_reunioes) | identificação | Reunião com empregador ou setorial registrada em Representação > Empregadores, com pauta, resumo (opcionalmente por IA a partir da ata), enc… |
| [reuniao_ata](#reuniao_ata) | identificação, **sensível: sindical** | Ata de reunião da diretoria, conselho fiscal ou assembleia, ligada ao mandato, com pauta, resumo, presentes e o PDF; as deliberações ficam e… |
| [reuniao_deliberacao](#reuniao_deliberacao) | identificação, **sensível: sindical** | Deliberação (decisão) de uma reunião registrada em ata: assunto, teor, votação, responsável, prazo, situação do cumprimento e grau de sigilo… |
| [reuniao_deliberacao_eventos](#reuniao_deliberacao_eventos) | identificação, **sensível: sindical** | Trilha das deliberações das atas: criação, alteração (campo, antes e depois) e exclusão, com autor e data. Mostrada só a quem alcança o sigi… |

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

## congresso_config_versoes

Histórico da configuração de cada congresso (só inserção): quem mudou, por quê e, depois da aprovação do regimento, a deliberação que autorizou.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `versao` | integer | não |  |  |  |  |
| `config` | jsonb | não |  |  |  |  |
| `motivo` | text | sim |  |  |  |  |
| `deliberacao` | text | sim |  |  |  |  |
| `autor_id` | uuid | sim |  | → usuarios (set null) | identificação | Quem gravou a versão. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `congresso_config_versoes_versao_check` `CHECK ((versao > 0))`

Índices: `congresso_config_versoes_pkey`, `congresso_config_versoes_um`

## congresso_eixos

Eixos temáticos do congresso.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `nome` | text | não |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congresso_eixos_nome_check` `CHECK ((length(TRIM(BOTH FROM nome)) > 0))`

Índices: `congresso_eixos_pkey`

## congresso_grupos

Grupos de trabalho (GT) do congresso, com eixo e vagas.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `eixo_id` | uuid | sim |  | → congresso_eixos (set null) |  |  |
| `nome` | text | não |  |  |  |  |
| `sala` | text | sim |  |  |  |  |
| `vagas` | integer | sim |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congresso_grupos_nome_check` `CHECK ((length(TRIM(BOTH FROM nome)) > 0))`; `congresso_grupos_vagas_check` `CHECK (((vagas IS NULL) OR (vagas > 0)))`

Índices: `congresso_grupos_pkey`

## congresso_papeis

Papéis do congresso (delegado, nato, suplente, observador, convidado…) com a matriz de direitos em jsonb (voz, voto, assinar moção, candidatar-se, quórum…).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `nome` | text | não |  |  |  |  |
| `categoria` | text | não | `'outro'::text` |  |  |  |
| `cor` | text | sim |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `direitos` | jsonb | não | `'{}'::jsonb` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congresso_papeis_categoria_check` `CHECK ((categoria = ANY (ARRAY['delegado'::text, 'suplente'::text, 'nato'::text, 'observador'::text, 'convidado'::text, 'expositor'::text, 'assessor'::text, 'imprensa'::text, 'equipe'::text, 'comissao'::text, 'outro'::text])))`; `congresso_papeis_nome_check` `CHECK ((length(TRIM(BOTH FROM nome)) > 0))`

Índices: `congresso_papeis_nome`, `congresso_papeis_pkey`

## congresso_participante_historico

Trilha de cada participante (só inserção): inscrição, troca de papel ou base, lista de espera, cancelamento.

- **LGPD:** **sensível: sindical** · titulares: participantes de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `participante_id` | uuid | sim |  | → congresso_participantes (set null) |  |  |
| `acao` | text | não |  |  |  |  |
| `detalhe` | jsonb | não | `'{}'::jsonb` |  | **sensível: sindical** | O que mudou (antes e depois). |
| `autor_id` | uuid | sim |  | → usuarios (set null) | identificação | Quem fez a alteração. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `congresso_participante_historico_pessoa`, `congresso_participante_historico_pkey`

## congresso_participantes

Pessoas do congresso: delegados, natos, suplentes, observadores, convidados. Podem ser filiados ou não. A participação revela atuação sindical.

- **LGPD:** identificação, **sensível: sindical** · titulares: delegados, observadores e convidados de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `nome` | text | não |  |  | identificação | Nome civil. |
| `nome_social` | text | sim |  |  | identificação | Nome social, usado no crachá e nas listas quando informado. |
| `cpf` | text | sim |  |  | identificação | CPF só com dígitos, para evitar duplicidade e conferir no credenciamento. |
| `email` | text | sim |  |  | identificação | E-mail para o link pessoal e avisos do congresso. |
| `telefone` | text | sim |  |  | identificação | Telefone de contato. |
| `genero` | text | sim |  |  | identificação | Gênero declarado, usado só para conferir cotas e paridade. |
| `filiacao_id` | uuid | sim |  | → filiacoes (set null) | **sensível: sindical** | Filiado correspondente, quando houver. |
| `usuario_id` | uuid | sim |  | → usuarios (set null) | identificação | Usuário do Confluir correspondente (ex.: diretor nato). |
| `papel_id` | uuid | sim |  | → congresso_papeis (set null) | **sensível: sindical** | Papel no congresso (define os direitos). |
| `unidade_id` | uuid | sim |  | → congresso_unidades (set null) | **sensível: sindical** | Base, entidade ou segmento que a pessoa representa. |
| `grupo_id` | uuid | sim |  | → congresso_grupos (set null) |  |  |
| `titular_id` | uuid | sim |  | → congresso_participantes (set null) | nenhum | Para suplentes: o titular a quem a pessoa substitui. |
| `situacao` | text | não | `'inscrito'::text` |  | nenhum | inscrito, confirmado, lista_espera, recusado ou cancelado. |
| `origem` | text | não | `'manual'::text` |  | nenhum | Como entrou: manual, nato, inscricao, planilha, indicacao, ata ou copia. |
| `inscrito_em` | timestamp with time zone | não | `now()` |  | nenhum | Horário da inscrição; decide a ordem quando o regimento define delegados por ordem de inscrição. |
| `acessibilidade` | text | sim |  |  | **sensível: saúde** | Necessidade de acessibilidade informada pela pessoa. Pode revelar deficiência: mostrar só a quem organiza. |
| `observacao` | text | sim |  |  | identificação | Observação interna da comissão. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congresso_participantes_cpf_check` `CHECK (((cpf IS NULL) OR (cpf ~ '^[0-9]{11}$'::text)))`; `congresso_participantes_nome_check` `CHECK ((length(TRIM(BOTH FROM nome)) > 0))`; `congresso_participantes_origem_check` `CHECK ((origem = ANY (ARRAY['manual'::text, 'nato'::text, 'inscricao'::text, 'planilha'::text, 'indicacao'::text, 'ata'::text, 'copia'::text])))`; `congresso_participantes_situacao_check` `CHECK ((situacao = ANY (ARRAY['inscrito'::text, 'confirmado'::text, 'lista_espera'::text, 'recusado'::text, 'cancelado'::text])))`

Índices: `congresso_participantes_cpf`, `congresso_participantes_filiacao`, `congresso_participantes_ordem`, `congresso_participantes_pkey`

## congresso_sessoes

Sessões do programa (plenária, mesa, grupo, setorial, atividade conjunta…), com horário.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `tipo` | text | não | `'plenaria'::text` |  |  |  |
| `titulo` | text | não |  |  |  |  |
| `inicio` | timestamp with time zone | sim |  |  |  |  |
| `fim` | timestamp with time zone | sim |  |  |  |  |
| `grupo_id` | uuid | sim |  | → congresso_grupos (set null) |  |  |
| `eixo_id` | uuid | sim |  | → congresso_eixos (set null) |  |  |
| `local` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congresso_sessoes_horario` `CHECK (((fim IS NULL) OR (inicio IS NULL) OR (fim >= inicio)))`; `congresso_sessoes_tipo_check` `CHECK ((tipo = ANY (ARRAY['credenciamento'::text, 'plenaria'::text, 'mesa_debate'::text, 'grupo'::text, 'setorial'::text, 'atividade_conjunta'::text, 'cultural'::text, 'eleicao'::text, 'outra'::text])))`; `congresso_sessoes_titulo_check` `CHECK ((length(TRIM(BOTH FROM titulo)) > 0))`

Índices: `congresso_sessoes_congresso`, `congresso_sessoes_pkey`

## congresso_unidades

Bases, entidades, segmentos ou ramos que formam as delegações, com limite de delegados e número de sócios para o cálculo de vagas.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `tipo` | text | não | `'base'::text` |  |  |  |
| `nome` | text | não |  |  |  |  |
| `limite_delegados` | integer | sim |  |  |  |  |
| `socios` | integer | sim |  |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congresso_unidades_limite_delegados_check` `CHECK (((limite_delegados IS NULL) OR (limite_delegados >= 0)))`; `congresso_unidades_nome_check` `CHECK ((length(TRIM(BOTH FROM nome)) > 0))`; `congresso_unidades_socios_check` `CHECK (((socios IS NULL) OR (socios >= 0)))`; `congresso_unidades_tipo_check` `CHECK ((tipo = ANY (ARRAY['base'::text, 'entidade'::text, 'segmento'::text, 'ramo'::text, 'delegacao'::text])))`

Índices: `congresso_unidades_nome`, `congresso_unidades_pkey`

## congressos

Congressos, plenárias e conferências que a entidade promove ou de que participa. Cada um aponta para um evento do módulo Eventos e guarda a configuração vigente das regras (regimento como dado).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `evento_id` | uuid | sim |  | → eventos (set null) |  |  |
| `nome` | text | não |  |  |  |  |
| `edicao` | integer | sim |  |  |  |  |
| `tema` | text | sim |  |  |  |  |
| `modo` | text | não | `'promove'::text` |  | nenhum | promove: a entidade organiza; participa: a entidade só envia delegação a um evento externo. |
| `situacao` | text | não | `'preparacao'::text` |  | nenhum | preparacao, inscricoes, em_andamento, encerrado ou cancelado. |
| `etapa_anterior_id` | uuid | sim |  | → congressos (set null) |  |  |
| `etapa_seguinte_id` | uuid | sim |  | → congressos (set null) |  |  |
| `etapa_seguinte_nome` | text | sim |  |  | nenhum | Nome da etapa seguinte quando ela não está no Confluir (ex.: Plenafup 2027). |
| `config` | jsonb | não | `'{}'::jsonb` |  | nenhum | Configuração vigente (catálogo em docs/plano-congressos-configuracao.md), normalizada por src/lib/congressos/config.ts. Cópia da última linha de congresso_config_versoes. |
| `config_versao` | integer | não | `1` |  | nenhum | Número da versão vigente da configuração. |
| `regimento_aprovado_em` | timestamp with time zone | sim |  |  | nenhum | Quando o regimento foi aprovado; depois disso, mudar a configuração exige registrar a deliberação. |
| `criado_por` | uuid | sim |  | → usuarios (set null) |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congressos_edicao_check` `CHECK (((edicao IS NULL) OR (edicao > 0)))`; `congressos_modo_check` `CHECK ((modo = ANY (ARRAY['promove'::text, 'participa'::text])))`; `congressos_nome_check` `CHECK ((length(TRIM(BOTH FROM nome)) > 0))`; `congressos_situacao_check` `CHECK ((situacao = ANY (ARRAY['preparacao'::text, 'inscricoes'::text, 'em_andamento'::text, 'encerrado'::text, 'cancelado'::text])))`

Índices: `congressos_emp`, `congressos_evento`, `congressos_pkey`

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
| `sigilo_documento` | text | não | `'restrito'::text` |  | nenhum | Sigilo da ata: PDF, pauta, resumo e observações só aparecem para quem tem nível de sigilo das deliberações igual ou acima (livre, reservado, restrito). Título, data, local, tipo e presentes ficam visíveis a quem consulta atas. Padrão restrito. |

Checks: `reuniao_ata_sigilo_documento_check` `CHECK ((sigilo_documento = ANY (ARRAY['livre'::text, 'reservado'::text, 'restrito'::text])))`; `reuniao_ata_tipo_check` `CHECK ((tipo = ANY (ARRAY['diretoria'::text, 'conselho_fiscal'::text, 'assembleia'::text, 'outra'::text])))`

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
| `responsavel` | text | sim |  |  | identificação | Responsável em texto livre, quando não é usuário do sistema (ex.: "Secretaria-geral"). |
| `prazo` | date | sim |  |  | nenhum | Prazo para cumprir a decisão, quando fixado. |
| `situacao` | text | não | `'a_cumprir'::text` |  | nenhum | a_cumprir, em_execucao, cumprida ou cancelada. |
| `sigilo` | text | não | `'reservado'::text` |  | nenhum | livre, reservado ou restrito: quem pode consultar depende do nível de sigilo concedido ao usuário. |
| `criado_por` | uuid | sim |  |  | identificação | Usuário que registrou a deliberação. |
| `atualizado_por` | uuid | sim |  |  | identificação | Usuário que alterou a deliberação por último. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `responsavel_id` | uuid | sim |  | → usuarios (set null) | identificação | Usuário responsável por cumprir a decisão; recebe o aviso de prazo vencido. Precisa ter nível de sigilo que alcance a deliberação. |

Checks: `reuniao_deliberacao_sigilo_check` `CHECK ((sigilo = ANY (ARRAY['livre'::text, 'reservado'::text, 'restrito'::text])))`; `reuniao_deliberacao_situacao_check` `CHECK ((situacao = ANY (ARRAY['a_cumprir'::text, 'em_execucao'::text, 'cumprida'::text, 'cancelada'::text])))`

Índices: `reuniao_deliberacao_ata_idx`, `reuniao_deliberacao_emp_situacao_idx`, `reuniao_deliberacao_pkey`, `reuniao_deliberacao_responsavel_idx`

## reuniao_deliberacao_eventos

Trilha das deliberações das atas: criação, alteração (campo, antes e depois) e exclusão, com autor e data. Mostrada só a quem alcança o sigilo gravado na linha.

- **LGPD:** identificação, **sensível: sindical** · titulares: diretores e participantes
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `deliberacao_id` | uuid | sim |  | → reuniao_deliberacao (set null) | nenhum | Deliberação a que o evento se refere; nulo depois que ela é excluída (a trilha fica). |
| `ata_id` | uuid | sim |  | → reuniao_ata (**cascade**) | nenhum | Ata da deliberação — mantém a trilha ligada à ata mesmo após a exclusão da deliberação. |
| `evento` | text | não |  |  | nenhum | criada, alterada ou excluida. |
| `origem` | text | não | `'manual'::text` |  | nenhum | manual (formulário) ou ia (lida do PDF da ata ao salvar). |
| `mudancas` | jsonb | não | `'[]'::jsonb` |  | identificação | Na alteração: lista de {campo, antes, depois} já formatados para leitura (responsável pelo nome, datas dd/mm/aaaa). |
| `assunto` | text | sim |  |  | identificação | Assunto da deliberação no momento do evento (identifica a excluída). |
| `sigilo` | text | não |  |  | nenhum | Sigilo da deliberação no momento do evento — decide quem vê a linha. |
| `autor_id` | uuid | sim |  |  | identificação | Usuário que fez a mudança. |
| `autor_nome` | text | sim |  |  | identificação | Nome do autor no momento (a trilha não muda se o cadastro mudar). |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `reuniao_deliberacao_eventos_evento_check` `CHECK ((evento = ANY (ARRAY['criada'::text, 'alterada'::text, 'excluida'::text])))`; `reuniao_deliberacao_eventos_origem_check` `CHECK ((origem = ANY (ARRAY['manual'::text, 'ia'::text])))`; `reuniao_deliberacao_eventos_sigilo_check` `CHECK ((sigilo = ANY (ARRAY['livre'::text, 'reservado'::text, 'restrito'::text])))`

Índices: `reuniao_deliberacao_eventos_ata_idx`, `reuniao_deliberacao_eventos_deliberacao_idx`, `reuniao_deliberacao_eventos_pkey`
