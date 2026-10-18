<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Saúde do trabalhador

13 tabelas. Diagrama: [er/saude.md](../er/saude.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [saude_acompanhamento](#saude_acompanhamento) | **sensível: saúde** | Acompanhamento de saúde de um assistido por período e intervalo de atendimentos, de um tipo. Espelho do Bubble; sem uso direto encontrado no… |
| [saude_agenda_atendimentos](#saude_agenda_atendimentos) | **sensível: saúde** | Agendamentos de atendimento de saúde: período, se online, assistido e profissional. Espelho de Saúde Agenda Atendimentos do Bubble. |
| [saude_assistidos](#saude_assistidos) | identificação, **sensível: saúde**, trabalhista | Pessoas atendidas pelo serviço de saúde da entidade, ligadas ou não a um filiado, com regras de retenção NR-07 e cópia cifrada da identidade… |
| [saude_atendimentos](#saude_atendimentos) | **sensível: saúde** | Atendimentos de saúde prestados aos assistidos: data, tipo, profissional e observação aberta; o relatório clínico fica cifrado em saude_aten… |
| [saude_atendimentos_acessos](#saude_atendimentos_acessos) | **sensível: saúde** | Trilha de auditoria dos relatórios clínicos. SOMENTE INSERT — nunca atualizar nem apagar. Inclui tentativas negadas. |
| [saude_atendimentos_relatorio](#saude_atendimentos_relatorio) | **sensível: saúde** | Relatório clínico do atendimento, CIFRADO pela aplicação (AES-256-GCM). A chave vive em SAUDE_RELATORIO_CHAVE, fora do banco: ler esta tabel… |
| [saude_atendimentos_tipos](#saude_atendimentos_tipos) | — | Tipos de atendimento de saúde oferecidos (psicologia, assistência social etc.); define quais profissionais leem cada relatório. Origem Bubbl… |
| [saude_cat](#saude_cat) | identificação, **sensível: saúde**, trabalhista | Comunicações de Acidente de Trabalho. Os comentários por coluna indicam o número do campo no formulário oficial da CAT. |
| [saude_cat_duplicidades_ignoradas](#saude_cat_duplicidades_ignoradas) | — | Grupos de CATs apontados como possível duplicidade que um usuário marcou como não duplicados, para não reaparecerem na revisão. |
| [saude_cat_import](#saude_cat_import) | identificação, **sensível: saúde**, trabalhista | Tabela de staging da carga das CATs: CSV importado pelo Table Editor com os 50 campos do formulário em texto, transformado em saude_cat pelo… |
| [saude_cipa_agenda](#saude_cipa_agenda) | identificação | Convites e reuniões de CIPA nas empresas da base com representação da entidade: data, unidade, situação, assuntos e ata. Espelho de Saúde CI… |
| [saude_cipa_representantes](#saude_cipa_representantes) | identificação, **sensível: sindical** | Representantes da entidade designados para uma reunião de CIPA, usuários ou filiados, e se compareceram. |
| [saude_profissionais](#saude_profissionais) | identificação, trabalhista | Profissionais do serviço de saúde da entidade (psicólogo, assistente social etc.) vinculados a um usuário, com conselho de classe e tipo de … |

## saude_acompanhamento

Acompanhamento de saúde de um assistido por período e intervalo de atendimentos, de um tipo. Espelho do Bubble; sem uso direto encontrado no código atual além do vínculo em saude_atendimentos.

- **LGPD:** **sensível: saúde** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `data_inicio` | date | sim |  |  |  |  |
| `data_termino` | date | sim |  |  |  |  |
| `intervalo` | text | sim |  |  |  | Periodicidade prevista dos atendimentos. |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tipo_id` | uuid | sim |  | → saude_atendimentos_tipos | **sensível: saúde** | Tipo de atendimento (ex.: psicologia). |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `assistido_id` | uuid | sim |  | → saude_assistidos |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `saude_acompanhamento_assistido_idx`, `saude_acompanhamento_bubble_id_key`, `saude_acompanhamento_pkey`

## saude_agenda_atendimentos

Agendamentos de atendimento de saúde: período, se online, assistido e profissional. Espelho de Saúde Agenda Atendimentos do Bubble.

- **LGPD:** **sensível: saúde** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `inicio` | date | sim |  |  |  |  |
| `termino` | date | sim |  |  |  |  |
| `online` | boolean | sim |  |  |  |  |
| `assistido_id` | uuid | sim |  | → saude_assistidos | **sensível: saúde** | Revela que a pessoa está em atendimento de saúde. |
| `profissional_id` | uuid | sim |  | → saude_profissionais |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `saude_agenda_assistido_idx`, `saude_agenda_atendimentos_bubble_id_key`, `saude_agenda_atendimentos_pkey`

## saude_assistidos

Pessoas atendidas pelo serviço de saúde da entidade, ligadas ou não a um filiado, com regras de retenção NR-07 e cópia cifrada da identidade após anonimização. Espelho de Saúde Assistidos do Bubble.

- **LGPD:** identificação, **sensível: saúde**, trabalhista · titulares: filiados e trabalhadores atendidos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `nome` | text | sim |  |  | identificação |  |
| `observacoes` | text | sim |  |  | **sensível: saúde** |  |
| `filiado_id` | uuid | sim |  | → filiacoes |  |  |
| `empresa_id` | uuid | sim |  | → empresa | trabalhista | Empregador do assistido. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `nome_retido_cifrado` | text | sim |  |  | identificação | Cópia do nome, cifrada, gravada na anonimização do cadastro. É a âncora de identidade do acervo retido — sem ela o prontuário deixa de ser atribuível ao trabalhador e não serve a PPP nem a nexo previdenciário. |
| `cpf_retido_cifrado` | text | sim |  |  | identificação |  |
| `retencao_ate` | date | sim |  |  |  | Até quando o registro fica retido identificado. Regras (NR-07 7.6.1.1 e Anexo V): filiado sem vínculo empregatício = data de registro + 20 anos; empregado = contrato_demissao + 20 anos; empregado exposto a cancerígeno químico ou radiação ionizante = contrato_demissao + 40 anos. A norma diz "no mínimo": isto é PISO, nunca teto. |
| `retencao_regime` | text | sim |  |  | **sensível: saúde** | Regime que comanda o prazo quando ele extrapola a NR-07: benzeno (IN 2/1995 e PPEOB), radiacao_cnen (dosimetria individual), amianto (latência longa), previdenciario (LTCAT/PPP). Preenchido = descarte NUNCA automático, sempre com análise. |
| `retencao_observacao` | text | sim |  |  | **sensível: saúde** |  |
| `exposicao_cancerigeno_quimico` | boolean | não | `false` |  | **sensível: saúde** | NR-07 Anexo V: dobra a guarda para 40 anos. Não é derivável do sistema — pessoal_atividades_riscos e _perigos estão vazias — então é declaração manual, alimentada pelo PGR. |
| `exposicao_radiacao_ionizante` | boolean | não | `false` |  | **sensível: saúde** |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `saude_assistidos_bubble_id_key`, `saude_assistidos_filiado_idx`, `saude_assistidos_pkey`, `saude_assistidos_retencao_idx`

## saude_atendimentos

Atendimentos de saúde prestados aos assistidos: data, tipo, profissional e observação aberta; o relatório clínico fica cifrado em saude_atendimentos_relatorio. Origem Bubble.

- **LGPD:** **sensível: saúde** · titulares: filiados e trabalhadores atendidos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `data_atendimento` | date | sim |  |  | **sensível: saúde** |  |
| `observacao_aberta` | text | sim |  |  | **sensível: saúde** | Observação não cifrada; pode conter informação clínica. |
| `atendente_id` | uuid | sim |  | → usuarios |  | Usuário que registrou o atendimento. |
| `assistido_id` | uuid | sim |  | → saude_assistidos |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tipo_id` | uuid | sim |  | → saude_atendimentos_tipos | **sensível: saúde** |  |
| `profissional_id` | uuid | sim |  | → saude_profissionais |  |  |
| `acompanhamento_id` | uuid | sim |  | → saude_acompanhamento |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `saude_atendimentos_assistido_idx`, `saude_atendimentos_bubble_id_key`, `saude_atendimentos_data_idx`, `saude_atendimentos_pkey`, `saude_atendimentos_tipo_idx`

## saude_atendimentos_acessos

Trilha de auditoria dos relatórios clínicos. SOMENTE INSERT — nunca atualizar nem apagar. Inclui tentativas negadas.

- **LGPD:** **sensível: saúde** · titulares: usuários do sistema e assistidos
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `atendimento_id` | uuid | não |  | → saude_atendimentos (**cascade**) |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `acao` | text | não |  |  |  | Ação tentada sobre o relatório: ler, gravar, negado. |
| `motivo` | text | sim |  |  |  | Justificativa ou motivo da negativa. |
| `criado_em` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `saude_atendimentos_acessos_atendimento_idx`, `saude_atendimentos_acessos_pkey`, `saude_atendimentos_acessos_usuario_idx`

## saude_atendimentos_relatorio

Relatório clínico do atendimento, CIFRADO pela aplicação (AES-256-GCM). A chave vive em SAUDE_RELATORIO_CHAVE, fora do banco: ler esta tabela diretamente não revela conteúdo. Acesso restrito ao autor, a profissional do mesmo tipo do atendimento e à coordenação clínica — NÃO à gestão nem à pessoa atendida, que vê apenas saude_atendimentos.observacao_aberta. Toda leitura é registrada em saude_atendimentos_acessos.

- **LGPD:** **sensível: saúde** · titulares: filiados e trabalhadores atendidos
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `atendimento_id` | uuid | não |  | → saude_atendimentos (**cascade**) |  |  |
| `relatorio_cifrado` | text | não |  |  | **sensível: saúde** | base64(iv \|\| authTag \|\| ciphertext) — AES-256-GCM com AAD = atendimento_id. |
| `chave_versao` | smallint | não | `1` |  |  |  |
| `autor_profissional_id` | uuid | sim |  | → saude_profissionais |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `saude_atendimentos_relatorio_pkey`

## saude_atendimentos_tipos

Tipos de atendimento de saúde oferecidos (psicologia, assistência social etc.); define quais profissionais leem cada relatório. Origem Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `saude_atendimentos_tipos_bubble_id_key`, `saude_atendimentos_tipos_pkey`

## saude_cat

Comunicações de Acidente de Trabalho. Os comentários por coluna indicam o número do campo no formulário oficial da CAT.

- **LGPD:** identificação, **sensível: saúde**, trabalhista · titulares: filiados e trabalhadores acidentados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `emitente` | text | sim |  |  |  | CAT campo 1 |
| `tipo_cat` | text | sim |  |  |  | CAT campo 2 |
| `iniciativa_cat` | text | sim |  |  |  | CAT campo 3 |
| `fonte_cadastramento` | text | sim |  |  |  | CAT campo 4 |
| `numero_cat` | text | sim |  |  |  | CAT campo 5 |
| `recibo_esocial` | text | sim |  |  |  | CAT campo 6 — recibo do evento no eSocial da CAT de origem |
| `empregador_id` | uuid | sim |  | → empresa |  |  |
| `empregador_razao_social` | text | sim |  |  |  | CAT campo 7 |
| `empregador_tipo` | text | sim |  |  |  | CAT campo 8 |
| `empregador_inscricao` | text | sim |  |  | trabalhista | CAT campo 9 |
| `empregador_cnae` | text | sim |  |  |  | CAT campo 10 |
| `filiado_id` | uuid | sim |  | → filiacoes |  |  |
| `trabalhador_nome` | text | sim |  |  | identificação | CAT campo 11 |
| `trabalhador_cpf` | text | sim |  |  | identificação | CAT campo 12 — só dígitos; chave de ligação com filiacoes.cpf |
| `trabalhador_nascimento` | date | sim |  |  | identificação | CAT campo 13 |
| `trabalhador_sexo` | text | sim |  |  | identificação | CAT campo 14 |
| `trabalhador_estado_civil` | text | sim |  |  | identificação | CAT campo 15 |
| `trabalhador_cbo_codigo` | text | sim |  |  | trabalhista | CAT campo 16 — código CBO |
| `trabalhador_cbo` | text | sim |  |  | trabalhista | CAT campo 16 — descrição da ocupação |
| `filiacao_previdencia` | text | sim |  |  | trabalhista | CAT campo 17 |
| `areas` | text | sim |  |  | trabalhista | CAT campo 18 |
| `data_acidente` | date | sim |  |  | **sensível: saúde** | CAT campo 19 |
| `hora_acidente` | text | sim |  |  |  | CAT campo 20 |
| `horas_trabalhadas_antes` | text | sim |  |  | trabalhista | CAT campo 21 |
| `tipo_acidente` | text | sim |  |  | **sensível: saúde** | CAT campo 22 |
| `houve_afastamento` | boolean | sim |  |  | **sensível: saúde** | CAT campo 23 |
| `ultimo_dia_trabalhado` | date | sim |  |  | trabalhista | CAT campo 24 |
| `local_acidente` | text | sim |  |  |  | CAT campo 25 |
| `local_especificacao` | text | sim |  |  |  | CAT campo 26 |
| `local_inscricao` | text | sim |  |  |  | CAT campo 27 |
| `local_uf` | text | sim |  |  |  | CAT campo 28 |
| `local_municipio` | text | sim |  |  |  | CAT campo 29 |
| `local_pais` | text | sim |  |  |  | CAT campo 30 |
| `parte_atingida_codigo` | text | sim |  |  | **sensível: saúde** | CAT campo 31 — código (9 dígitos) |
| `parte_atingida` | text | sim |  |  | **sensível: saúde** | CAT campo 31 — descrição |
| `agente_causador_codigo` | text | sim |  |  | **sensível: saúde** | CAT campo 32 — código (9 dígitos) |
| `agente_causador` | text | sim |  |  | **sensível: saúde** | CAT campo 32 — descrição |
| `lateralidade` | text | sim |  |  | **sensível: saúde** | CAT campo 33 |
| `situacao_geradora_codigo` | text | sim |  |  |  | CAT campo 34 — código (9 dígitos) |
| `situacao_geradora` | text | sim |  |  | **sensível: saúde** | CAT campo 34 — descrição |
| `descricao_truncada` | boolean | não | `false` |  |  | Registro de origem antiga: descrições dos campos 31/32/34/45 chegaram cortadas e sem código. Marca para revisão. |
| `houve_registro_policial` | boolean | sim |  |  | **sensível: saúde** | CAT campo 35 |
| `houve_morte` | boolean | sim |  |  | **sensível: saúde** | CAT campo 36 |
| `data_obito` | date | sim |  |  | **sensível: saúde** | CAT campo 37 |
| `observacoes_acidente` | text | sim |  |  | **sensível: saúde** | CAT campo 38 |
| `data_recebimento` | date | sim |  |  |  | CAT campo 39 |
| `data_atendimento` | date | sim |  |  | **sensível: saúde** | CAT campo 40 |
| `hora_atendimento` | text | sim |  |  | **sensível: saúde** | CAT campo 41 |
| `houve_internacao` | boolean | sim |  |  | **sensível: saúde** | CAT campo 42 |
| `duracao_tratamento_dias` | integer | sim |  |  | **sensível: saúde** | CAT campo 43 |
| `afastamento_durante_tratamento` | boolean | sim |  |  | **sensível: saúde** | CAT campo 44 |
| `natureza_lesao_codigo` | text | sim |  |  | **sensível: saúde** | CAT campo 45 — código (9 dígitos) |
| `natureza_lesao` | text | sim |  |  | **sensível: saúde** | CAT campo 45 — descrição |
| `diagnostico_provavel` | text | sim |  |  | **sensível: saúde** | CAT campo 46 |
| `cid10` | text | sim |  |  | **sensível: saúde** | CAT campo 47 — código CID-10 normalizado com ponto (ex.: S01.4) |
| `cid10_descricao` | text | sim |  |  | **sensível: saúde** | CAT campo 47 — descrição |
| `local_e_data` | text | sim |  |  | **sensível: saúde** | CAT campo 48 |
| `medico_nome_crm_uf` | text | sim |  |  | identificação | CAT campo 49 |
| `observacoes_atestado` | text | sim |  |  | **sensível: saúde** | CAT campo 50 |
| `arquivo_url` | text | sim |  |  | **sensível: saúde** | PDF da CAT. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `cat_origem_id` | uuid | sim |  | → saude_cat (set null) |  | CAT de origem (inicial) desta CAT de reabertura ou comunicação de óbito. |
| `duplicada_de_id` | uuid | sim |  | → saude_cat (set null) |  | Esta CAT é cópia descartada da CAT indicada; fica fora das listas. Nada é apagado. |
| `descartada_em` | timestamp with time zone | sim |  |  |  |  |
| `descartada_por` | uuid | sim |  | → usuarios |  |  |

Únicas: `UNIQUE (bubble_id)`

Checks: `saude_cat_cpf_digitos` `CHECK (((trabalhador_cpf IS NULL) OR (trabalhador_cpf ~ '^[0-9]{11}$'::text)))`

Índices: `idx_saude_cat_duplicada`, `idx_saude_cat_origem`, `saude_cat_agente_causador_idx`, `saude_cat_bubble_id_key`, `saude_cat_cid10_idx`, `saude_cat_cpf_idx`, `saude_cat_data_acidente_idx`, `saude_cat_empregador_idx`, `saude_cat_filiado_idx`, `saude_cat_numero_idx`, `saude_cat_parte_atingida_idx`, `saude_cat_pkey`, `saude_cat_trabalhador_idx`, `saude_cat_truncada_idx`

## saude_cat_duplicidades_ignoradas

Grupos de CATs apontados como possível duplicidade que um usuário marcou como não duplicados, para não reaparecerem na revisão.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tipo` | text | não | `'acidente'::text` |  |  |  |
| `chave` | text | não | `''::text` |  |  | Chave do grupo de duplicidade (ex.: CPF + data do acidente). |
| `cats` | uuid[] | não | `'{}'::uuid[]` |  |  | CATs do grupo ignorado. |
| `motivo` | text | sim |  |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `saude_cat_duplicidades_ignoradas_pkey`, `ux_saude_cat_duplicidades_ignoradas`

## saude_cat_import

Tabela de staging da carga das CATs: CSV importado pelo Table Editor com os 50 campos do formulário em texto, transformado em saude_cat pelos SQLs saude-cat-3-transformacao.sql. Sem uso no código da aplicação.

- **LGPD:** identificação, **sensível: saúde**, trabalhista · titulares: filiados e trabalhadores acidentados
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| `00 EMPREGADOR` | text | sim |  |  |  |  |
| `01 - IDENTIFICAÇÃO Emitente` | text | sim |  |  |  |  |
| `02 - IDENTIFICAÇÃO Tipo de CAT` | text | sim |  |  |  |  |
| `03 - IDENTIFICAÇÃO Iniciativa da CAT` | text | sim |  |  |  |  |
| `04 - IDENTIFICAÇÃO Fonte do Cadastramento` | text | sim |  |  |  |  |
| `05 - IDENTIFICAÇÃO Número da CAT` | text | sim |  |  |  |  |
| `06 - IDENTIFICAÇÃO Recibo eSocial` | text | sim |  |  |  |  |
| `07 - EMPREGADOR Razão Social / Nome` | text | sim |  |  |  |  |
| `08 - EMPREGADOR Tipo` | text | sim |  |  |  |  |
| `09 - EMPREGADOR Número de Inscrição` | text | sim |  |  |  |  |
| `10 - EMPREGADOR CNAE` | text | sim |  |  |  |  |
| `11 - ACIDENTADO Nome` | text | sim |  |  | identificação |  |
| `12 - ACIDENTADO CPF` | text | sim |  |  | identificação |  |
| `13 - ACIDENTADO Data de Nascimento` | text | sim |  |  | identificação |  |
| `14 - ACIDENTADO Sexo` | text | sim |  |  | identificação |  |
| `15 - ACIDENTADO Estado Civil` | text | sim |  |  | identificação |  |
| `16 - ACIDENTADO CBO` | text | sim |  |  | trabalhista |  |
| `17 - ACIDENTADO Filiação à PS` | text | sim |  |  | trabalhista |  |
| `18 - ACIDENTADO Áreas` | text | sim |  |  | trabalhista |  |
| `19 - ACIDENTE Data do acidente` | text | sim |  |  | **sensível: saúde** |  |
| `20 - ACIDENTE Hora do acidente` | text | sim |  |  |  |  |
| `21 - ACIDENTE Após quantas horas de trabalho?` | text | sim |  |  | trabalhista |  |
| `22 - ACIDENTE Tipo` | text | sim |  |  | **sensível: saúde** |  |
| `23 - ACIDENTE Houve afastamento?` | text | sim |  |  | **sensível: saúde** |  |
| `24 - ACIDENTE Último dia trabalhado` | text | sim |  |  | trabalhista |  |
| `25 - ACIDENTE Local do acidente` | text | sim |  |  |  |  |
| `26 - ACIDENTE Especificação do local do acidente` | text | sim |  |  |  |  |
| `27 - ACIDENTE CNPJ/CAEPF/CNO do local` | text | sim |  |  |  |  |
| `28 - ACIDENTE UF` | text | sim |  |  |  |  |
| `29 - ACIDENTE Município do local do acidente` | text | sim |  |  |  |  |
| `30 - ACIDENTE País` | text | sim |  |  |  |  |
| `31 - ACIDENTE Parte do corpo atingida` | text | sim |  |  | **sensível: saúde** |  |
| `32 - ACIDENTE Agente causador` | text | sim |  |  | **sensível: saúde** |  |
| `33 - ACIDENTE Lateralidade` | text | sim |  |  | **sensível: saúde** |  |
| `34 - ACIDENTE Situação geradora` | text | sim |  |  | **sensível: saúde** |  |
| `35 - ACIDENTE Houve registro policial?` | text | sim |  |  | **sensível: saúde** |  |
| `36 - ACIDENTE Houve morte?` | text | sim |  |  | **sensível: saúde** |  |
| `37 - ACIDENTE Data do óbito` | text | sim |  |  | **sensível: saúde** |  |
| `38 - ACIDENTE Observações` | text | sim |  |  | **sensível: saúde** |  |
| `39 - ACIDENTE Data do Recebimento` | text | sim |  |  |  |  |
| `40 - ATENDIMENTO Data` | text | sim |  |  | **sensível: saúde** |  |
| `41 - ATENDIMENTO Hora` | text | sim |  |  | **sensível: saúde** |  |
| `42 - ATENDIMENTO Houve internação?` | text | sim |  |  | **sensível: saúde** |  |
| `43 - ATENDIMENTO Provável Duração do tratamento (dias)` | text | sim |  |  | **sensível: saúde** |  |
| `44 - ATENDIMENTO Afastar-se durante tratamento` | text | sim |  |  | **sensível: saúde** |  |
| `45 - LESÃO Descrição e natureza da lesão` | text | sim |  |  | **sensível: saúde** |  |
| `46 - DIAGNÓSTICO Diagnóstico provável` | text | sim |  |  | **sensível: saúde** |  |
| `47 - DIAGNÓSTICO CID` | text | sim |  |  | **sensível: saúde** |  |
| `48 - DIAGNÓSTICO Local e Data` | text | sim |  |  | **sensível: saúde** |  |
| `49 - DIAGNÓSTICO Nome do médico, CRM e UF` | text | sim |  |  | identificação |  |
| `50 - DIAGNÓSTICO Observações` | text | sim |  |  | **sensível: saúde** |  |
| `Supabase_id` | text | sim |  |  |  | Id da CAT já existente no Supabase, quando a linha atualiza uma CAT. |
| `unique id` | text | sim |  |  |  | Id Bubble da CAT. |

## saude_cipa_agenda

Convites e reuniões de CIPA nas empresas da base com representação da entidade: data, unidade, situação, assuntos e ata. Espelho de Saúde CIPA Agenda do Bubble; gravada em Saúde > CIPA.

- **LGPD:** identificação
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `ata_arquivo` | text | sim |  |  |  | Caminho do PDF da ata no bucket privado `saude`. Nunca URL pública — a exibição gera signed URL de 1h. |
| `data_reuniao` | date | sim |  |  |  |  |
| `demanda_embarque` | boolean | sim |  |  |  | A reunião exige embarque do representante em plataforma offshore. |
| `id_google_calendar` | text | sim |  |  |  | Id do evento no Google Agenda (legado Bubble). |
| `motivo_especifico` | text | sim |  |  |  |  |
| `online` | boolean | sim |  |  |  |  |
| `ordinaria` | boolean | sim |  |  |  |  |
| `representantes_sind_raw` | jsonb | sim |  |  | identificação | Legado Bubble: lista dos representantes sindicais da reunião. |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `unidade_id` | uuid | sim |  | → voto_unidades_presenciais |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `convite_recebido_em` | date | sim |  |  |  | Quando o convite chegou. Nulo = reunião registrada sem convite formal. |
| `situacao` | text | não | `'convidado'::text` |  |  | convidado \| compareceu \| nao_compareceu \| recusado. O registro é o CONVITE: recusa e ausência ficam gravadas, senão a frequência de convites por empresa não tem denominador. |
| `motivo_ausencia` | text | sim |  |  |  | Por que não houve representação. Preenchido em nao_compareceu/recusado. |
| `assuntos` | text | sim |  |  |  | Assuntos tratados na reunião. Texto livre — não é conteúdo clínico e não tem o sigilo do relatório de atendimento. |
| `observacoes` | text | sim |  |  |  |  |
| `unidade` | text | sim |  |  |  | Unidade/plataforma onde ocorreu a reunião, em texto. A FK `unidade_id` aponta para voto_unidades_presenciais, cujas 31 linhas migradas estão TODAS VAZIAS (inclusive o nome) — não há de onde escolher. |

Únicas: `UNIQUE (bubble_id)`

Índices: `saude_cipa_agenda_bubble_id_key`, `saude_cipa_agenda_data_idx`, `saude_cipa_agenda_empresa_idx`, `saude_cipa_agenda_pkey`, `saude_cipa_agenda_situacao_idx`

## saude_cipa_representantes

Representantes da entidade designados para uma reunião de CIPA, usuários ou filiados, e se compareceram.

- **LGPD:** identificação, **sensível: sindical** · titulares: diretores e filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `reuniao_id` | uuid | não |  | → saude_cipa_agenda (**cascade**) |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes | **sensível: sindical** | Representante sindical na CIPA; revela atuação sindical. |
| `nome` | text | sim |  |  | identificação |  |
| `compareceu` | boolean | não | `false` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `saude_cipa_representante_identificado` `CHECK (((usuario_id IS NOT NULL) OR (filiado_id IS NOT NULL) OR (nome IS NOT NULL)))`

Índices: `saude_cipa_representantes_filiado_idx`, `saude_cipa_representantes_pkey`, `saude_cipa_representantes_reuniao_idx`, `saude_cipa_representantes_usuario_idx`

## saude_profissionais

Profissionais do serviço de saúde da entidade (psicólogo, assistente social etc.) vinculados a um usuário, com conselho de classe e tipo de atendimento que podem ler. Origem Bubble.

- **LGPD:** identificação, trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `usuario_id` | uuid | não |  | → usuarios |  |  |
| `profissao` | text | sim |  |  | trabalhista |  |
| `conselho_classe` | text | sim |  |  | trabalhista |  |
| `registro_conselho` | text | sim |  |  | identificação | Número do registro no conselho (CRP, CRESS etc.). |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tipo_id` | uuid | sim |  | → saude_atendimentos_tipos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `acesso_todos_tipos` | boolean | não | `false` |  |  | Coordenação clínica: lê relatórios de todos os tipos. Conceder apenas a profissional habilitado — NUNCA derivar de saude_gestao, que é permissão administrativa. |
| `inativo` | boolean | não | `false` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `saude_profissionais_bubble_id_key`, `saude_profissionais_pkey`, `saude_profissionais_usuario_idx`
