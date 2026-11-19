<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Representação, acordos e negociações

38 tabelas. Diagrama: [er/representacao.md](../er/representacao.md).

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
| [congresso_apontamentos](#congresso_apontamentos) | identificação | Anotações e emendas (acréscimo, supressão, alteração) e dissensos registrados pela relatoria de cada grupo. Só inserção; retirar marca retir… |
| [congresso_apreciacoes](#congresso_apreciacoes) | identificação | Votação de uma proposta no grupo (a favor, contra, abstenção) e a classificação pela regra do regimento. |
| [congresso_config_versoes](#congresso_config_versoes) | — | Histórico da configuração de cada congresso (só inserção): quem mudou, por quê e, depois da aprovação do regimento, a deliberação que autori… |
| [congresso_crachas](#congresso_crachas) | **sensível: sindical** | Vias do crachá de cada participante. Só a via ativa vale; segunda via invalida a anterior. O QR leva um código cujo hash fica aqui. |
| [congresso_eixos](#congresso_eixos) | — | Eixos temáticos do congresso. |
| [congresso_grupo_funcoes](#congresso_grupo_funcoes) | **sensível: sindical** | Coordenação e relatoria de cada grupo de trabalho, eleitas no grupo ou indicadas pela comissão. |
| [congresso_grupos](#congresso_grupos) | — | Grupos de trabalho (GT) do congresso, com eixo e vagas. |
| [congresso_papeis](#congresso_papeis) | — | Papéis do congresso (delegado, nato, suplente, observador, convidado…) com a matriz de direitos em jsonb (voz, voto, assinar moção, candidat… |
| [congresso_participante_historico](#congresso_participante_historico) | **sensível: sindical** | Trilha de cada participante (só inserção): inscrição, troca de papel ou base, lista de espera, cancelamento. |
| [congresso_participantes](#congresso_participantes) | identificação, **sensível: sindical** | Pessoas do congresso: delegados, natos, suplentes, observadores, convidados. Podem ser filiados ou não. A participação revela atuação sindic… |
| [congresso_presencas](#congresso_presencas) | **sensível: sindical** | Presença por sessão: entrada, saída, meio (porta, código da sala, chamada, estação, virtual, papel) e nível de prova de que a pessoa estava … |
| [congresso_proposta_origens](#congresso_proposta_origens) | — | De quais propostas uma proposta fundida nasceu, para rastrear qualquer resolução até o apontamento inicial. |
| [congresso_proposta_versoes](#congresso_proposta_versoes) | identificação | Cada versão do texto de uma proposta, com o motivo (grupo, consolidação, fusão, plenária). Só inserção: texto nunca é sobrescrito. |
| [congresso_propostas](#congresso_propostas) | — | Propostas do congresso: caderno de teses, etapas anteriores, novas no grupo ou em plenária, e as nascidas de fusão. O texto atual é a última… |
| [congresso_sessoes](#congresso_sessoes) | — | Sessões do programa (plenária, mesa, grupo, setorial, atividade conjunta…), com horário. |
| [congresso_substituicoes](#congresso_substituicoes) | **sensível: sindical** | Suplente que assume no lugar de um titular, com quem autorizou. Desfazer não apaga: marca desfeita_em. |
| [congresso_unidades](#congresso_unidades) | — | Bases, entidades, segmentos ou ramos que formam as delegações, com limite de delegados e número de sócios para o cálculo de vagas. |
| [congresso_votacao_itens](#congresso_votacao_itens) | — | Propostas de cada votação da plenária (uma, ou várias numa votação em bloco). |
| [congresso_votacoes](#congresso_votacoes) | identificação | Resultado de cada votação da plenária (de uma proposta ou de um bloco): forma, contagem do crachá, maioria aplicada e resultado. Votos indiv… |
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

## congresso_apontamentos

Anotações e emendas (acréscimo, supressão, alteração) e dissensos registrados pela relatoria de cada grupo. Só inserção; retirar marca retirado_em.

- **LGPD:** identificação · titulares: relatores de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `grupo_id` | uuid | sim |  | → congresso_grupos (**cascade**) |  |  |
| `proposta_id` | uuid | sim |  | → congresso_propostas (**cascade**) |  |  |
| `tipo` | text | não | `'apontamento'::text` |  |  |  |
| `texto` | text | não |  |  |  |  |
| `autor` | text | sim |  |  | identificação | Nome de quem registrou o apontamento (relator), não de quem falou no grupo. |
| `retirado_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `congresso_apontamentos_texto_check` `CHECK ((length(TRIM(BOTH FROM texto)) > 0))`; `congresso_apontamentos_tipo_check` `CHECK ((tipo = ANY (ARRAY['apontamento'::text, 'acrescimo'::text, 'supressao'::text, 'alteracao'::text, 'dissenso'::text])))`

Índices: `congresso_apontamentos_grupo`, `congresso_apontamentos_pkey`, `congresso_apontamentos_proposta`

## congresso_apreciacoes

Votação de uma proposta no grupo (a favor, contra, abstenção) e a classificação pela regra do regimento.

- **LGPD:** identificação · titulares: relatores de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `grupo_id` | uuid | não |  | → congresso_grupos (**cascade**) |  |  |
| `proposta_id` | uuid | não |  | → congresso_propostas (**cascade**) |  |  |
| `a_favor` | integer | não | `0` |  |  |  |
| `contra` | integer | não | `0` |  |  |  |
| `abstencao` | integer | não | `0` |  |  |  |
| `resultado` | text | não |  |  |  |  |
| `autor` | text | sim |  |  | identificação | Nome de quem registrou a contagem. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congresso_apreciacoes_a_favor_check` `CHECK ((a_favor >= 0))`; `congresso_apreciacoes_abstencao_check` `CHECK ((abstencao >= 0))`; `congresso_apreciacoes_contra_check` `CHECK ((contra >= 0))`; `congresso_apreciacoes_resultado_check` `CHECK ((resultado = ANY (ARRAY['aprovada_direto'::text, 'plenaria'::text, 'plenaria_com_vencida'::text, 'rejeitada'::text])))`

Índices: `congresso_apreciacoes_pkey`, `congresso_apreciacoes_um`

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

## congresso_crachas

Vias do crachá de cada participante. Só a via ativa vale; segunda via invalida a anterior. O QR leva um código cujo hash fica aqui.

- **LGPD:** **sensível: sindical** · titulares: participantes de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `participante_id` | uuid | não |  | → congresso_participantes (**cascade**) |  |  |
| `via` | integer | não | `1` |  |  |  |
| `codigo_hash` | text | não |  |  | **credencial (nunca exportar)** | SHA-256 do código impresso no QR do crachá. |
| `ativo` | boolean | não | `true` |  |  |  |
| `emitido_em` | timestamp with time zone | não | `now()` |  |  |  |
| `emitido_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem emitiu a via. |
| `invalidado_em` | timestamp with time zone | sim |  |  |  |  |
| `motivo` | text | sim |  |  | nenhum | Motivo da segunda via ou da invalidação. |

Checks: `congresso_crachas_via_check` `CHECK ((via > 0))`

Índices: `congresso_crachas_ativo`, `congresso_crachas_codigo`, `congresso_crachas_pkey`

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

## congresso_grupo_funcoes

Coordenação e relatoria de cada grupo de trabalho, eleitas no grupo ou indicadas pela comissão.

- **LGPD:** **sensível: sindical** · titulares: participantes de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `grupo_id` | uuid | não |  | → congresso_grupos (**cascade**) |  |  |
| `participante_id` | uuid | não |  | → congresso_participantes (**cascade**) |  |  |
| `funcao` | text | não |  |  |  |  |
| `escolha` | text | não | `'eleita'::text` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `congresso_grupo_funcoes_escolha_check` `CHECK ((escolha = ANY (ARRAY['eleita'::text, 'indicada'::text])))`; `congresso_grupo_funcoes_funcao_check` `CHECK ((funcao = ANY (ARRAY['coordenacao'::text, 'relatoria'::text, 'relatoria_adjunta'::text])))`

Índices: `congresso_grupo_funcoes_pkey`, `congresso_grupo_funcoes_um`

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
| `relatorio_entregue_em` | timestamp with time zone | sim |  |  | nenhum | Quando o relatório do grupo foi entregue; depois disso o grupo não altera mais propostas nem apontamentos. |
| `relatorio_entregue_por` | text | sim |  |  | identificação | Nome de quem entregou o relatório (relator pelo link pessoal ou usuário do painel). |

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
| `inscricao_publica` | boolean | não | `false` |  | nenhum | O papel aparece como opção na inscrição pública (ex.: delegado, observador). |

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
| `token_hash` | text | sim |  |  | **credencial (nunca exportar)** | SHA-256 do token do link pessoal (/congresso/eu/<token>). O token em claro só existe no link enviado. |
| `token_gerado_em` | timestamp with time zone | sim |  |  | nenhum | Quando o link pessoal atual foi gerado; gerar outro invalida o anterior. |
| `aceite_em` | timestamp with time zone | sim |  |  | nenhum | Ciência do tratamento de dados na inscrição pública. |
| `inscricao_ip` | text | sim |  |  | identificação | IP da inscrição pública, para apurar abuso (ex.: inscrições em massa). |
| `credenciado_em` | timestamp with time zone | sim |  |  | nenhum | Quando a pessoa foi credenciada (uma vez por congresso). Nulo = não credenciada. |
| `credenciado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem credenciou na mesa. |
| `documento_conferido` | boolean | não | `false` |  | nenhum | A mesa conferiu documento com foto no credenciamento. |
| `modalidade` | text | não | `'presencial'::text` |  | nenhum | presencial ou distancia: define que atos a pessoa pode fazer e com que prova (local da decisão). |

Checks: `congresso_participantes_cpf_check` `CHECK (((cpf IS NULL) OR (cpf ~ '^[0-9]{11}$'::text)))`; `congresso_participantes_modalidade` `CHECK ((modalidade = ANY (ARRAY['presencial'::text, 'distancia'::text])))`; `congresso_participantes_nome_check` `CHECK ((length(TRIM(BOTH FROM nome)) > 0))`; `congresso_participantes_origem_check` `CHECK ((origem = ANY (ARRAY['manual'::text, 'nato'::text, 'inscricao'::text, 'planilha'::text, 'indicacao'::text, 'ata'::text, 'copia'::text])))`; `congresso_participantes_situacao_check` `CHECK ((situacao = ANY (ARRAY['inscrito'::text, 'confirmado'::text, 'lista_espera'::text, 'recusado'::text, 'cancelado'::text])))`

Índices: `congresso_participantes_cpf`, `congresso_participantes_filiacao`, `congresso_participantes_ordem`, `congresso_participantes_pkey`, `congresso_participantes_token`

## congresso_presencas

Presença por sessão: entrada, saída, meio (porta, código da sala, chamada, estação, virtual, papel) e nível de prova de que a pessoa estava no local.

- **LGPD:** **sensível: sindical** · titulares: participantes de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `sessao_id` | uuid | não |  | → congresso_sessoes (**cascade**) |  |  |
| `participante_id` | uuid | não |  | → congresso_participantes (**cascade**) |  |  |
| `entrada_em` | timestamp with time zone | não | `now()` |  |  |  |
| `saida_em` | timestamp with time zone | sim |  |  |  |  |
| `metodo` | text | não |  |  |  |  |
| `nivel` | text | não |  |  |  |  |
| `modalidade` | text | não | `'presencial'::text` |  |  |  |
| `registrado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem registrou (nulo quando a própria pessoa leu o código da sala). |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `congresso_presencas_metodo_check` `CHECK ((metodo = ANY (ARRAY['porta'::text, 'codigo_sala'::text, 'chamada'::text, 'estacao'::text, 'virtual'::text, 'papel'::text])))`; `congresso_presencas_modalidade_check` `CHECK ((modalidade = ANY (ARRAY['presencial'::text, 'distancia'::text])))`; `congresso_presencas_nivel_check` `CHECK ((nivel = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text])))`

Índices: `congresso_presencas_congresso`, `congresso_presencas_pkey`, `congresso_presencas_um`

## congresso_proposta_origens

De quais propostas uma proposta fundida nasceu, para rastrear qualquer resolução até o apontamento inicial.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `proposta_id` | uuid | não |  | → congresso_propostas (**cascade**) |  |  |
| `origem_id` | uuid | não |  | → congresso_propostas (**cascade**) |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `congresso_proposta_origens_diferentes` `CHECK ((proposta_id <> origem_id))`

Índices: `congresso_proposta_origens_pkey`, `congresso_proposta_origens_um`

## congresso_proposta_versoes

Cada versão do texto de uma proposta, com o motivo (grupo, consolidação, fusão, plenária). Só inserção: texto nunca é sobrescrito.

- **LGPD:** identificação · titulares: relatores de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `proposta_id` | uuid | não |  | → congresso_propostas (**cascade**) |  |  |
| `versao` | integer | não |  |  |  |  |
| `texto` | text | não |  |  |  |  |
| `motivo` | text | não | `'criada'::text` |  |  |  |
| `autor` | text | sim |  |  | identificação | Nome de quem registrou a versão. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `congresso_proposta_versoes_motivo_check` `CHECK ((motivo = ANY (ARRAY['criada'::text, 'grupo'::text, 'consolidacao'::text, 'fusao'::text, 'plenaria'::text, 'correcao'::text])))`; `congresso_proposta_versoes_versao_check` `CHECK ((versao > 0))`

Índices: `congresso_proposta_versoes_pkey`, `congresso_proposta_versoes_um`

## congresso_propostas

Propostas do congresso: caderno de teses, etapas anteriores, novas no grupo ou em plenária, e as nascidas de fusão. O texto atual é a última versão; a autoria é do grupo ou da origem, não de pessoa.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `numero` | integer | não |  |  |  |  |
| `eixo_id` | uuid | sim |  | → congresso_eixos (set null) |  |  |
| `grupo_id` | uuid | sim |  | → congresso_grupos (set null) |  |  |
| `origem` | text | não | `'grupo'::text` |  |  |  |
| `origem_descricao` | text | sim |  |  |  |  |
| `abrangencia` | text | sim |  |  |  |  |
| `texto` | text | não |  |  | nenhum | Texto da versão atual (cópia da última linha de congresso_proposta_versoes). |
| `versao` | integer | não | `1` |  |  |  |
| `situacao` | text | não | `'em_debate'::text` |  |  |  |
| `classificacao` | text | sim |  |  |  |  |
| `fundida_em` | uuid | sim |  | → congresso_propostas (set null) |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `destaque_por` | text | sim |  |  | identificação | Quem pediu destaque na plenária, quando o regimento manda registrar o nome. |
| `destaque_em` | timestamp with time zone | sim |  |  |  |  |
| `criada_por` | text | sim |  |  | identificação | Quem registrou a proposta no sistema (relator ou usuário do painel). |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `congresso_propostas_classificacao_check` `CHECK (((classificacao IS NULL) OR (classificacao = ANY (ARRAY['consenso'::text, 'debate'::text]))))`; `congresso_propostas_numero_check` `CHECK ((numero > 0))`; `congresso_propostas_origem_check` `CHECK ((origem = ANY (ARRAY['caderno'::text, 'etapa_anterior'::text, 'documento'::text, 'grupo'::text, 'plenaria'::text, 'fusao'::text])))`; `congresso_propostas_situacao_check` `CHECK ((situacao = ANY (ARRAY['em_debate'::text, 'entregue'::text, 'fundida'::text, 'plenaria'::text, 'aprovada'::text, 'rejeitada'::text, 'retirada'::text, 'anais'::text])))`; `congresso_propostas_texto_check` `CHECK ((length(TRIM(BOTH FROM texto)) > 0))`; `congresso_propostas_versao_check` `CHECK ((versao > 0))`

Índices: `congresso_propostas_eixo`, `congresso_propostas_grupo`, `congresso_propostas_numero`, `congresso_propostas_pkey`

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
| `segredo` | text | sim |  |  | **credencial (nunca exportar)** | Semente do código da sala, que muda a cada poucos segundos (prova de presença nível C). Nunca sai do servidor. |

Checks: `congresso_sessoes_horario` `CHECK (((fim IS NULL) OR (inicio IS NULL) OR (fim >= inicio)))`; `congresso_sessoes_tipo_check` `CHECK ((tipo = ANY (ARRAY['credenciamento'::text, 'plenaria'::text, 'mesa_debate'::text, 'grupo'::text, 'setorial'::text, 'atividade_conjunta'::text, 'cultural'::text, 'eleicao'::text, 'outra'::text])))`; `congresso_sessoes_titulo_check` `CHECK ((length(TRIM(BOTH FROM titulo)) > 0))`

Índices: `congresso_sessoes_congresso`, `congresso_sessoes_pkey`

## congresso_substituicoes

Suplente que assume no lugar de um titular, com quem autorizou. Desfazer não apaga: marca desfeita_em.

- **LGPD:** **sensível: sindical** · titulares: delegados e suplentes de congressos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `titular_id` | uuid | não |  | → congresso_participantes (**cascade**) |  |  |
| `suplente_id` | uuid | não |  | → congresso_participantes (**cascade**) |  |  |
| `motivo` | text | sim |  |  |  |  |
| `autorizado_por` | text | sim |  |  | identificação | Nome de quem autorizou a troca (coordenação da base ou comissão), quando o regimento exige. |
| `registrado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem registrou na mesa. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `desfeita_em` | timestamp with time zone | sim |  |  |  |  |
| `desfeita_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem desfez a troca. |

Checks: `congresso_substituicoes_pessoas` `CHECK ((titular_id <> suplente_id))`

Índices: `congresso_substituicoes_pkey`, `congresso_substituicoes_suplente`, `congresso_substituicoes_titular`

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

## congresso_votacao_itens

Propostas de cada votação da plenária (uma, ou várias numa votação em bloco).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `votacao_id` | uuid | não |  | → congresso_votacoes (**cascade**) |  |  |
| `proposta_id` | uuid | não |  | → congresso_propostas (**cascade**) |  |  |

Índices: `congresso_votacao_itens_pkey`, `congresso_votacao_itens_proposta`, `congresso_votacao_itens_um`

## congresso_votacoes

Resultado de cada votação da plenária (de uma proposta ou de um bloco): forma, contagem do crachá, maioria aplicada e resultado. Votos individuais não são guardados.

- **LGPD:** identificação · titulares: usuários que registram a votação
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `congresso_id` | uuid | não |  | → congressos (**cascade**) |  |  |
| `sessao_id` | uuid | sim |  | → congresso_sessoes (set null) |  |  |
| `tipo` | text | não | `'proposta'::text` |  |  |  |
| `forma` | text | não |  |  |  |  |
| `a_favor` | integer | sim |  |  |  |  |
| `contra` | integer | sim |  |  |  |  |
| `abstencao` | integer | sim |  |  |  |  |
| `maioria` | text | não |  |  |  |  |
| `base_votantes` | integer | sim |  |  |  |  |
| `resultado` | text | não |  |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `registrado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem lançou o resultado. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `desfeita_em` | timestamp with time zone | sim |  |  |  |  |
| `desfeita_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem desfez o lançamento. |

Checks: `congresso_votacoes_a_favor_check` `CHECK (((a_favor IS NULL) OR (a_favor >= 0)))`; `congresso_votacoes_abstencao_check` `CHECK (((abstencao IS NULL) OR (abstencao >= 0)))`; `congresso_votacoes_contra_check` `CHECK (((contra IS NULL) OR (contra >= 0)))`; `congresso_votacoes_forma_check` `CHECK ((forma = ANY (ARRAY['sem_oposicao'::text, 'visual'::text, 'contagem'::text, 'urna'::text])))`; `congresso_votacoes_resultado_check` `CHECK ((resultado = ANY (ARRAY['aprovada'::text, 'rejeitada'::text, 'empate'::text])))`; `congresso_votacoes_tipo_check` `CHECK ((tipo = ANY (ARRAY['proposta'::text, 'bloco'::text])))`

Índices: `congresso_votacoes_congresso`, `congresso_votacoes_pkey`

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
| `slug` | text | sim |  |  | nenhum | Endereço da página pública de inscrição (/congresso/<slug>), único na entidade. |
| `inscricao_publica` | boolean | não | `false` |  | nenhum | Liga a inscrição pela página pública; a janela de datas vem da configuração (inscricao.abre/fecha). |

Checks: `congressos_edicao_check` `CHECK (((edicao IS NULL) OR (edicao > 0)))`; `congressos_modo_check` `CHECK ((modo = ANY (ARRAY['promove'::text, 'participa'::text])))`; `congressos_nome_check` `CHECK ((length(TRIM(BOTH FROM nome)) > 0))`; `congressos_situacao_check` `CHECK ((situacao = ANY (ARRAY['preparacao'::text, 'inscricoes'::text, 'em_andamento'::text, 'encerrado'::text, 'cancelado'::text])))`

Índices: `congressos_emp`, `congressos_evento`, `congressos_pkey`, `congressos_slug`

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
