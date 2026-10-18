<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Ferramentas administrativas

8 tabelas. Diagrama: [er/ferramentas.md](../er/ferramentas.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [assinaturas](#assinaturas) | identificação | Assinatura de um usuário em uma ata de reunião, herdada do Bubble. Tabela vazia e sem uso encontrado no código (a assinatura atual usa docum… |
| [demandas](#demandas) | identificação | Demanda (iniciativa ou pedido interno com responsável, prazo e orçamento) da tela Ferramentas > Demandas. Colunas *_raw guardam listas do Bu… |
| [demandas_check](#demandas_check) | — | Checklist (lista de tarefas) dentro de uma demanda, herdado do Bubble; lido em lib/db/nucleo.ts. Tabela vazia. |
| [demandas_check_tarefas](#demandas_check_tarefas) | identificação | Tarefa com demandante e demandado, prazo e documentos, filha de demanda, projeto ou anomalia (pai polimórfico). Lida em lib/db/nucleo.ts; or… |
| [demandas_comentarios](#demandas_comentarios) | identificação | Comentário em uma demanda (origem Bubble), lido em lib/db/nucleo.ts. Tabela vazia. |
| [demandas_departamentos](#demandas_departamentos) | — | Junção N:N entre tarefa de demanda e departamento envolvido (lib/db/departamentos.ts). |
| [ferramentas_anomalias](#ferramentas_anomalias) | identificação | Registro de anomalia/não conformidade com investigação de causa raiz (5 porquês) e providências, da tela Ferramentas > Anomalias. Origem Bub… |
| [projeto](#projeto) | — | Projetos da entidade (orçamento, prazo, autorização, centro de custo), migrados do Bubble; compras e ordens podem ser ligadas a um projeto. … |

## assinaturas

Assinatura de um usuário em uma ata de reunião, herdada do Bubble. Tabela vazia e sem uso encontrado no código (a assinatura atual usa documento_assinaturas).

- **LGPD:** identificação · titulares: diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `assinador_id` | uuid | sim |  | → usuarios |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `ata_id` | uuid | sim |  | → diretoria_atas |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `assinaturas_bubble_id_key`, `assinaturas_pkey`

## demandas

Demanda (iniciativa ou pedido interno com responsável, prazo e orçamento) da tela Ferramentas > Demandas. Colunas *_raw guardam listas do Bubble ainda não normalizadas.

- **LGPD:** identificação · titulares: funcionários, diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  | identificação | Texto livre; pode citar pessoas. |
| `ordem` | integer | sim |  |  |  |  |
| `orcamento` | numeric | sim |  |  |  |  |
| `prazo` | date | sim |  |  |  |  |
| `situacao` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `estrategico` | boolean | sim |  |  |  | Marca a demanda como estratégica. |
| `membro_responsavel_id` | uuid | sim |  | → usuarios |  |  |
| `membros_raw` | jsonb | sim |  |  | identificação | Lista de bubble_ids dos membros (pessoas) da demanda. |
| `checklists_raw` | jsonb | sim |  |  |  |  |
| `demandas_raw` | jsonb | sim |  |  |  |  |
| `departamentos_assoc_raw` | jsonb | sim |  |  |  |  |
| `anexos_raw` | jsonb | sim |  |  |  |  |
| `arquivos_raw` | jsonb | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `demandas_bubble_id_key`, `demandas_pkey`, `idx_demandas_criado_por`

## demandas_check

Checklist (lista de tarefas) dentro de uma demanda, herdado do Bubble; lido em lib/db/nucleo.ts. Tabela vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `demanda_id` | uuid | sim |  | → demandas |  |  |
| `tarefas_raw` | jsonb | sim |  |  |  | Lista de bubble_ids das tarefas, não normalizada. |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `demandas_check_bubble_id_key`, `demandas_check_pkey`

## demandas_check_tarefas

Tarefa com demandante e demandado, prazo e documentos, filha de demanda, projeto ou anomalia (pai polimórfico). Lida em lib/db/nucleo.ts; origem Bubble.

- **LGPD:** identificação · titulares: funcionários, diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `demanda` | text | sim |  |  |  | Texto antigo da tarefa (substituído por titulo). |
| `concluido` | boolean | sim | `false` |  |  |  |
| `principal` | boolean | sim | `false` |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `data_entrega` | date | sim |  |  |  |  |
| `data_prazo_entrega` | date | sim |  |  |  |  |
| `demandado_documentos` | text[] | sim |  |  | identificação | Arquivos anexados pelo demandado; podem conter dados pessoais. |
| `demandante_documentos` | text[] | sim |  |  | identificação | Arquivos anexados pelo demandante; podem conter dados pessoais. |
| `demandante_id` | uuid | sim |  | → usuarios |  |  |
| `demandado_id` | uuid | sim |  | → usuarios |  |  |
| `checklist_id` | uuid | sim |  | → demandas_check |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `projeto_id` | uuid | sim |  | → projeto |  |  |
| `anomalia_id` | uuid | sim |  | → ferramentas_anomalias |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `checklist_raw` | jsonb | sim |  |  |  |  |
| `departamentos_raw` | jsonb | sim |  |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `demanda_id` | uuid | sim |  | → demandas (set null) |  | Demanda-pai (opcional). Junto de projeto_id e anomalia_id compõe o pai polimórfico da tarefa; todos nulos = tarefa solta. |
| `titulo` | text | sim |  |  |  | Enunciado da tarefa. Substitui o antigo texto em `demanda` (mantido só por compatibilidade). |

Únicas: `UNIQUE (bubble_id)`

Índices: `demandas_check_tarefas_bubble_id_key`, `demandas_check_tarefas_pkey`, `idx_tarefas_anomalia`, `idx_tarefas_demanda`, `idx_tarefas_demandado`, `idx_tarefas_projeto`

## demandas_comentarios

Comentário em uma demanda (origem Bubble), lido em lib/db/nucleo.ts. Tabela vazia.

- **LGPD:** identificação · titulares: funcionários, diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `descricao` | text | sim |  |  | identificação | Texto livre do comentário. |
| `demanda_id` | uuid | sim |  | → demandas |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `demandas_comentarios_bubble_id_key`, `demandas_comentarios_pkey`

## demandas_departamentos

Junção N:N entre tarefa de demanda e departamento envolvido (lib/db/departamentos.ts).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `tarefa_id` | uuid | não |  | → demandas_check_tarefas (**cascade**) |  |  |
| 🔑 `departamento_id` | uuid | não |  | → empresa_departamentos (**cascade**) |  |  |

Índices: `demandas_departamentos_pkey`

## ferramentas_anomalias

Registro de anomalia/não conformidade com investigação de causa raiz (5 porquês) e providências, da tela Ferramentas > Anomalias. Origem Bubble.

- **LGPD:** identificação · titulares: funcionários, diretores, envolvidos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `conformidade` | text | sim |  |  |  | Classificação da ocorrência quanto à conformidade. |
| `data_ocorrencia` | date | sim |  |  |  |  |
| `descricao_detalhada` | text | sim |  |  | identificação | Relato do ocorrido; pode citar pessoas envolvidas. |
| `envolvidos_raw` | jsonb | sim |  |  | identificação | Lista de bubble_ids das pessoas envolvidas. |
| `envolvidos_cientes` | boolean | sim |  |  |  |  |
| `fato` | text | sim |  |  | identificação | Resumo do fato; texto livre. |
| `responsavel_id` | uuid | sim |  | → usuarios |  |  |
| `anomalia_investigada` | boolean | sim |  |  |  |  |
| `causa_raiz` | text | sim |  |  |  |  |
| `investigacao_pq1` | text | sim |  |  |  | Primeiro porquê da análise de causa raiz (5 porquês); pq2 a pq5 seguem. |
| `investigacao_pq2` | text | sim |  |  |  |  |
| `investigacao_pq3` | text | sim |  |  |  |  |
| `investigacao_pq4` | text | sim |  |  |  |  |
| `investigacao_pq5` | text | sim |  |  |  |  |
| `anomalia_tratada` | boolean | sim |  |  |  |  |
| `providencias_imediatas_raw` | jsonb | sim |  |  |  |  |
| `providencias_outras_raw` | jsonb | sim |  |  |  |  |
| `eficacia_verificada` | boolean | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `ferramentas_anomalias_bubble_id_key`, `ferramentas_anomalias_pkey`

## projeto

Projetos da entidade (orçamento, prazo, autorização, centro de custo), migrados do Bubble; compras e ordens podem ser ligadas a um projeto. Usado em Ferramentas administrativas, Projetos.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `descricao` | text | sim |  |  |  |  |
| `descricao_sumaria` | text | sim |  |  |  |  |
| `detalhamento` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `orcamento` | numeric | sim |  |  |  |  |
| `inicio` | date | sim |  |  |  |  |
| `termino_previsao` | date | sim |  |  |  |  |
| `estrategico` | boolean | sim |  |  |  | Projeto marcado como estratégico. |
| `finalizado` | boolean | sim |  |  |  |  |
| `autorizacao_autorizado` | boolean | sim |  |  |  |  |
| `autorizacao_quando` | date | sim |  |  |  |  |
| `autorizacao_autoriza_id` | uuid | sim |  | → usuarios |  |  |
| `centro_custo_id` | uuid | sim |  | → centros_de_custo |  |  |
| `compras_raw` | jsonb | sim |  |  |  | ids Bubble das compras ligadas, legado. |
| `demandas_raw` | jsonb | sim |  |  |  | ids Bubble das demandas ligadas, legado. |
| `departamentos_assoc_raw` | jsonb | sim |  |  |  | ids Bubble dos departamentos, legado. |
| `ordens_pagamento_raw` | jsonb | sim |  |  |  | ids Bubble das ordens, legado. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `projeto_bubble_id_key`, `projeto_pkey`
