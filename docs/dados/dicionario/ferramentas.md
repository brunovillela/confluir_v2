<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Ferramentas administrativas

22 tabelas. Diagrama: [er/ferramentas.md](../er/ferramentas.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [assinaturas](#assinaturas) | identificação | Assinatura de um usuário em uma ata de reunião, herdada do Bubble. Tabela vazia e sem uso encontrado no código (a assinatura atual usa docum… |
| [demandas](#demandas) | identificação | Demanda (iniciativa ou pedido interno com responsável, prazo e orçamento) da tela Ferramentas > Demandas. Colunas *_raw guardam listas do Bu… |
| [demandas_check](#demandas_check) | — | Checklist (lista de tarefas) dentro de uma demanda, herdado do Bubble; lido em lib/db/nucleo.ts. Tabela vazia. |
| [demandas_check_tarefas](#demandas_check_tarefas) | identificação | Tarefa com demandante e demandado, prazo e documentos, filha de demanda, projeto ou anomalia (pai polimórfico). Lida em lib/db/nucleo.ts; or… |
| [demandas_comentarios](#demandas_comentarios) | identificação | Comentário em uma demanda (origem Bubble), lido em lib/db/nucleo.ts. Tabela vazia. |
| [demandas_departamentos](#demandas_departamentos) | — | Junção N:N entre tarefa de demanda e departamento envolvido (lib/db/departamentos.ts). |
| [demandas_etiquetas](#demandas_etiquetas) | — | Etiquetas coloridas da entidade para as tarefas (nome único por entidade, cor de uma paleta fixa). |
| [demandas_filtros_salvos](#demandas_filtros_salvos) | identificação | Atalhos de filtro de Tarefas e Demandas, da pessoa ou compartilhados com a equipe. |
| [demandas_formularios](#demandas_formularios) | identificação | Formulários de pedido por setor: o pedido vira uma demanda do responsável, com as tarefas do modelo (Pedidos). |
| [demandas_modelo_itens](#demandas_modelo_itens) | — | Tarefas e marcos de um modelo, com o prazo em dias relativos à data de referência. |
| [demandas_modelos](#demandas_modelos) | — | Modelos de demanda ou de projeto, com as tarefas e marcos pré-montados (Ferramentas > Modelos). |
| [demandas_regras](#demandas_regras) | identificação | Regras "quando… então…" das tarefas e demandas (Ferramentas > Automações), de uma lista fechada de gatilhos e ações. |
| [demandas_regras_execucoes](#demandas_regras_execucoes) | — | Cada vez que uma regra agiu (o histórico da Automação); a chave impede agir duas vezes no mesmo atraso. |
| [demandas_seguidores](#demandas_seguidores) | identificação | Quem segue uma tarefa ou uma demanda e recebe os avisos dela (Ferramentas). A menção na conversa inscreve a pessoa. |
| [demandas_tarefa_comentarios](#demandas_tarefa_comentarios) | identificação | Conversa de uma tarefa (Ferramentas > Tarefas e Meu perfil > Minhas tarefas): mensagens do responsável, de quem pediu e de quem cuida das ta… |
| [demandas_tarefa_dependencias](#demandas_tarefa_dependencias) | — | Dependência entre tarefas: `tarefa_id` só começa quando `depende_de_id` termina (Gantt de Ferramentas > Tarefas e do projeto). |
| [demandas_tarefa_etiquetas](#demandas_tarefa_etiquetas) | — | Quais etiquetas cada tarefa tem. |
| [demandas_tarefa_itens](#demandas_tarefa_itens) | — | Checklist de uma tarefa: os passos marcáveis, com o progresso no cartão (Ferramentas > Tarefas). |
| [ferramentas_anomalias](#ferramentas_anomalias) | identificação | Registro de anomalia/não conformidade com investigação de causa raiz (5 porquês) e providências, da tela Ferramentas > Anomalias. Origem Bub… |
| [ferramentas_anomalias_sugestoes](#ferramentas_anomalias_sugestoes) | identificação | Anomalias sugeridas pelo sistema (km fora do normal, ordem devolvida 3+ vezes, ponto incompleto recorrente, compras canceladas, infrações re… |
| [projeto](#projeto) | — | Projetos da entidade (orçamento, prazo, autorização, centro de custo), migrados do Bubble; compras e ordens podem ser ligadas a um projeto. … |
| [projeto_marcos](#projeto_marcos) | — | Marcos (etapas com data prevista) de um projeto, em Ferramentas > Projetos. Marco vencido sem conclusão põe o projeto em "Atrasado" na carte… |

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
| `projeto_id` | uuid | sim |  | → projeto (set null) | nenhum | Projeto dono desta demanda (criada pelo projeto ao receber a primeira tarefa). Nulo nas demandas comuns; no máximo uma por projeto. |
| `formulario_id` | uuid | sim |  | → demandas_formularios (set null) | nenhum | Formulário de pedido que originou a demanda (Meus pedidos); nulo nas demais. |

Únicas: `UNIQUE (bubble_id)`

Índices: `demandas_bubble_id_key`, `demandas_formulario_idx`, `demandas_pkey`, `demandas_projeto_id_unico`, `idx_demandas_criado_por`

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
| `prioridade` | text | não | `'media'::text` |  | nenhum | Prioridade da tarefa: alta, media ou baixa (padrão media). Usada para ordenar as listas. |
| `recorrencia` | text | sim |  |  | nenhum | De quanto em quanto tempo a tarefa se repete: semanal, mensal, trimestral, semestral ou anual; nulo = não repete. Ao concluir, o sistema cria a próxima com o prazo avançado. |
| `recorrencia_proxima_id` | uuid | sim |  | → demandas_check_tarefas (set null) | nenhum | A tarefa criada quando esta (recorrente) foi concluída; impede criar outra ao reabrir e concluir de novo. |
| `procedimento_id` | uuid | sim |  | → fa_documentos (set null) | nenhum | Documento (Ferramentas > Documentos) com o procedimento que a tarefa segue; quem executa abre a versão mais recente pela tarefa. |
| `iniciada_em` | timestamp with time zone | sim |  |  | nenhum | Quando a tarefa passou a Em andamento (quadro de tarefas); nulo = A fazer. Concluída continua em `concluido`. |
| `data_inicio` | date | sim |  |  | nenhum | Quando a tarefa começa (linha do tempo / Gantt); opcional, a barra vai do início ao prazo. |

Únicas: `UNIQUE (bubble_id)`

Checks: `demandas_check_tarefas_prioridade_check` `CHECK ((prioridade = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text])))`; `demandas_check_tarefas_recorrencia_check` `CHECK (((recorrencia IS NULL) OR (recorrencia = ANY (ARRAY['semanal'::text, 'mensal'::text, 'trimestral'::text, 'semestral'::text, 'anual'::text]))))`

Índices: `demandas_check_tarefas_bubble_id_key`, `demandas_check_tarefas_pkey`, `demandas_check_tarefas_procedimento_idx`, `idx_tarefas_anomalia`, `idx_tarefas_demanda`, `idx_tarefas_demandado`, `idx_tarefas_projeto`

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

## demandas_etiquetas

Etiquetas coloridas da entidade para as tarefas (nome único por entidade, cor de uma paleta fixa).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `nome` | text | não |  |  |  |  |
| `cor` | text | não | `'cinza'::text` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `demandas_etiquetas_cor_check` `CHECK ((cor = ANY (ARRAY['cinza'::text, 'vermelho'::text, 'laranja'::text, 'amarelo'::text, 'verde'::text, 'azul'::text, 'roxo'::text, 'rosa'::text])))`

Índices: `demandas_etiquetas_nome_idx`, `demandas_etiquetas_pkey`

## demandas_filtros_salvos

Atalhos de filtro de Tarefas e Demandas, da pessoa ou compartilhados com a equipe.

- **LGPD:** identificação · titulares: funcionarios,diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `usuario_id` | uuid | não |  | → usuarios (**cascade**) | identificação | Quem salvou o filtro. |
| `pagina` | text | não |  |  |  |  |
| `nome` | text | não |  |  |  |  |
| `consulta` | text | não | `''::text` |  | nenhum | A consulta da página (parâmetros da URL, como responsavel=… e status=…), sem texto livre além da busca. |
| `compartilhado` | boolean | não | `false` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `demandas_filtros_salvos_consulta_check` `CHECK ((char_length(consulta) <= 500))`; `demandas_filtros_salvos_nome_check` `CHECK (((char_length(nome) >= 1) AND (char_length(nome) <= 60)))`; `demandas_filtros_salvos_pagina_check` `CHECK ((pagina = ANY (ARRAY['tarefas'::text, 'demandas'::text])))`

Índices: `demandas_filtros_salvos_idx`, `demandas_filtros_salvos_pkey`

## demandas_formularios

Formulários de pedido por setor: o pedido vira uma demanda do responsável, com as tarefas do modelo (Pedidos).

- **LGPD:** identificação · titulares: funcionarios,diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `nome` | text | não |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `responsavel_id` | uuid | sim |  | → usuarios (set null) | identificação | Quem recebe os pedidos do formulário (responsável pela demanda criada). |
| `modelo_id` | uuid | sim |  | → demandas_modelos (set null) |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `demandas_formularios_emp_idx`, `demandas_formularios_pkey`

## demandas_modelo_itens

Tarefas e marcos de um modelo, com o prazo em dias relativos à data de referência.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `modelo_id` | uuid | não |  | → demandas_modelos (**cascade**) |  |  |
| `tipo` | text | não | `'tarefa'::text` |  |  |  |
| `titulo` | text | não |  |  |  |  |
| `dias` | integer | não | `0` |  | nenhum | Dias em relação à data de referência informada ao usar o modelo (negativo = antes). |
| `prioridade` | text | não | `'media'::text` |  |  |  |
| `procedimento_id` | uuid | sim |  | → fa_documentos (set null) |  |  |
| `checklist` | text[] | não | `'{}'::text[]` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |

Checks: `demandas_modelo_itens_prioridade_check` `CHECK ((prioridade = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text])))`; `demandas_modelo_itens_tipo_check` `CHECK ((tipo = ANY (ARRAY['tarefa'::text, 'marco'::text])))`

Índices: `demandas_modelo_itens_modelo_idx`, `demandas_modelo_itens_pkey`

## demandas_modelos

Modelos de demanda ou de projeto, com as tarefas e marcos pré-montados (Ferramentas > Modelos).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `nome` | text | não |  |  |  |  |
| `tipo` | text | não | `'demanda'::text` |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `demandas_modelos_tipo_check` `CHECK ((tipo = ANY (ARRAY['demanda'::text, 'projeto'::text])))`

Índices: `demandas_modelos_emp_idx`, `demandas_modelos_pkey`

## demandas_regras

Regras "quando… então…" das tarefas e demandas (Ferramentas > Automações), de uma lista fechada de gatilhos e ações.

- **LGPD:** identificação · titulares: funcionarios,diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `gatilho` | text | não |  |  |  |  |
| `acao` | text | não |  |  |  |  |
| `demanda_id` | uuid | sim |  | → demandas (**cascade**) |  |  |
| `pessoa_id` | uuid | sim |  | → usuarios (**cascade**) | identificação | A pessoa da ação (a quem atribuir ou avisar). |
| `etiqueta_id` | uuid | sim |  | → demandas_etiquetas (**cascade**) |  |  |
| `ativa` | boolean | não | `true` |  |  |  |
| `criada_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem criou a regra. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `demandas_regras_acao_check` `CHECK ((acao = ANY (ARRAY['demanda_feito'::text, 'prioridade_alta'::text, 'atribuir'::text, 'etiquetar'::text, 'avisar'::text])))`; `demandas_regras_gatilho_check` `CHECK ((gatilho = ANY (ARRAY['tarefa_criada'::text, 'tarefa_concluida'::text, 'tarefa_atrasou'::text])))`

Índices: `demandas_regras_emp_idx`, `demandas_regras_pkey`

## demandas_regras_execucoes

Cada vez que uma regra agiu (o histórico da Automação); a chave impede agir duas vezes no mesmo atraso.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `regra_id` | uuid | não |  | → demandas_regras (**cascade**) |  |  |
| `tarefa_id` | uuid | sim |  | → demandas_check_tarefas (set null) |  |  |
| `chave` | text | não |  |  |  |  |
| `detalhe` | text | sim |  |  | nenhum | O que a regra fez, em texto curto (sem dado pessoal). |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (regra_id, chave)`

Índices: `demandas_regras_execucoes_chave`, `demandas_regras_execucoes_emp_idx`, `demandas_regras_execucoes_pkey`

## demandas_seguidores

Quem segue uma tarefa ou uma demanda e recebe os avisos dela (Ferramentas). A menção na conversa inscreve a pessoa.

- **LGPD:** identificação · titulares: funcionarios,diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `usuario_id` | uuid | não |  | → usuarios (**cascade**) | identificação | A pessoa que segue. |
| `tarefa_id` | uuid | sim |  | → demandas_check_tarefas (**cascade**) |  |  |
| `demanda_id` | uuid | sim |  | → demandas (**cascade**) |  |  |
| `origem` | text | não | `'manual'::text` |  | nenhum | manual = a pessoa escolheu seguir; mencao = foi mencionada na conversa da tarefa. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `demandas_seguidores_alvo_check` `CHECK ((num_nonnulls(tarefa_id, demanda_id) = 1))`; `demandas_seguidores_origem_check` `CHECK ((origem = ANY (ARRAY['manual'::text, 'mencao'::text])))`

Índices: `demandas_seguidores_demanda_uniq`, `demandas_seguidores_pkey`, `demandas_seguidores_tarefa_uniq`, `demandas_seguidores_usuario_idx`

## demandas_tarefa_comentarios

Conversa de uma tarefa (Ferramentas > Tarefas e Meu perfil > Minhas tarefas): mensagens do responsável, de quem pediu e de quem cuida das tarefas, com anexo opcional no bucket documentos.

- **LGPD:** identificação · titulares: funcionarios,diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `tarefa_id` | uuid | não |  | → demandas_check_tarefas (**cascade**) |  |  |
| `autor_id` | uuid | sim |  | → usuarios (set null) | identificação | Quem escreveu a mensagem. |
| `texto` | text | não | `''::text` |  | identificação | Texto livre da mensagem; pode citar pessoas. |
| `anexo_caminho` | text | sim |  |  | identificação | Caminho do anexo no bucket documentos (tarefas/<tarefa>/<arquivo>); nulo = sem anexo. |
| `anexo_nome` | text | sim |  |  | nenhum | Nome original do arquivo anexado. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `demandas_tarefa_comentarios_emp_idx`, `demandas_tarefa_comentarios_pkey`, `demandas_tarefa_comentarios_tarefa_idx`

## demandas_tarefa_dependencias

Dependência entre tarefas: `tarefa_id` só começa quando `depende_de_id` termina (Gantt de Ferramentas > Tarefas e do projeto).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `tarefa_id` | uuid | não |  | → demandas_check_tarefas (**cascade**) |  |  |
| `depende_de_id` | uuid | não |  | → demandas_check_tarefas (**cascade**) |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (tarefa_id, depende_de_id)`

Checks: `demandas_tarefa_dependencias_nao_ela_mesma` `CHECK ((tarefa_id <> depende_de_id))`

Índices: `demandas_tarefa_dependencias_depende_idx`, `demandas_tarefa_dependencias_emp_idx`, `demandas_tarefa_dependencias_par`, `demandas_tarefa_dependencias_pkey`

## demandas_tarefa_etiquetas

Quais etiquetas cada tarefa tem.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `tarefa_id` | uuid | não |  | → demandas_check_tarefas (**cascade**) |  |  |
| `etiqueta_id` | uuid | não |  | → demandas_etiquetas (**cascade**) |  |  |

Únicas: `UNIQUE (tarefa_id, etiqueta_id)`

Índices: `demandas_tarefa_etiquetas_emp_idx`, `demandas_tarefa_etiquetas_etiqueta_idx`, `demandas_tarefa_etiquetas_par`, `demandas_tarefa_etiquetas_pkey`

## demandas_tarefa_itens

Checklist de uma tarefa: os passos marcáveis, com o progresso no cartão (Ferramentas > Tarefas).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `tarefa_id` | uuid | não |  | → demandas_check_tarefas (**cascade**) |  |  |
| `texto` | text | não |  |  | nenhum | O passo (ex.: "pedir 3 orçamentos"). |
| `feito` | boolean | não | `false` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `demandas_tarefa_itens_emp_idx`, `demandas_tarefa_itens_pkey`, `demandas_tarefa_itens_tarefa_idx`

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

## ferramentas_anomalias_sugestoes

Anomalias sugeridas pelo sistema (km fora do normal, ordem devolvida 3+ vezes, ponto incompleto recorrente, compras canceladas, infrações recorrentes), que quem tem Anomalias abre ou descarta (Ferramentas > Anomalias).

- **LGPD:** identificação · titulares: funcionarios,diretores,envolvidos
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `origem` | text | não |  |  | nenhum | De onde veio a sugestão: km_anormal, ordem_devolvida, ponto_incompleto, compras_canceladas ou infracoes_condutor. |
| `chave` | text | não |  |  | nenhum | Identifica a ocorrência na origem (ex.: o id da movimentação), para não sugerir a mesma coisa duas vezes. |
| `fato` | text | não |  |  | identificação | Resumo pronto do fato; pode citar o condutor ou o funcionário. |
| `descricao` | text | sim |  |  | identificação | Detalhe pronto para a descrição da anomalia; pode citar pessoas. |
| `data_ocorrencia` | date | sim |  |  |  |  |
| `link` | text | sim |  |  | nenhum | Caminho no painel para conferir a origem. |
| `situacao` | text | não | `'pendente'::text` |  | nenhum | pendente (a avaliar), aberta (virou anomalia) ou descartada. |
| `anomalia_id` | uuid | sim |  | → ferramentas_anomalias (set null) |  |  |
| `decidido_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem abriu ou descartou a sugestão. |
| `decidido_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `ferramentas_anomalias_sugestoes_origem_check` `CHECK ((origem = ANY (ARRAY['km_anormal'::text, 'ordem_devolvida'::text, 'ponto_incompleto'::text, 'compras_canceladas'::text, 'infracoes_condutor'::text])))`; `ferramentas_anomalias_sugestoes_situacao_check` `CHECK ((situacao = ANY (ARRAY['pendente'::text, 'aberta'::text, 'descartada'::text])))`

Índices: `ferramentas_anomalias_sugestoes_chave_idx`, `ferramentas_anomalias_sugestoes_pendentes_idx`, `ferramentas_anomalias_sugestoes_pkey`

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

## projeto_marcos

Marcos (etapas com data prevista) de um projeto, em Ferramentas > Projetos. Marco vencido sem conclusão põe o projeto em "Atrasado" na carteira (lib/projetos-constantes.ts → situacaoDoProjeto).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `projeto_id` | uuid | não |  | → projeto (**cascade**) |  |  |
| `titulo` | text | não |  |  | nenhum | O que deve estar pronto no marco (ex.: "Contratar o espaço"). |
| `data_prevista` | date | não |  |  | nenhum | Data em que o marco deve estar cumprido. |
| `concluido_em` | date | sim |  |  | nenhum | Data em que o marco foi dado por cumprido; nulo = em aberto. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `projeto_marcos_emp_idx`, `projeto_marcos_pkey`, `projeto_marcos_projeto_idx`
