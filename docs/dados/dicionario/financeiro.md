<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Financeiro

25 tabelas. Diagrama: [er/financeiro.md](../er/financeiro.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [banco_extratos](#banco_extratos) | identificação | Cada registro é um extrato bancário da entidade importado na conciliação (OFX ou CSV), com conta, período, saldo final e quantos lançamentos… |
| [banco_lancamentos](#banco_lancamentos) | financeiro, identificação | Lançamentos de extrato bancário da entidade importados para conciliação; cada um pode ser ligado a uma ordem de pagamento, comprovação ou co… |
| [caixa_contas](#caixa_contas) | identificação | Caixas físicos (dinheiro em espécie) sob responsabilidade de um usuário, com saldo controlado pelas movimentações. Criados em Financeiro, Ca… |
| [caixa_movimentacoes](#caixa_movimentacoes) | financeiro, identificação | Entradas e saídas de um caixa físico: aportes, despesas pagas em espécie, transferências entre caixas. O responsável lança no Meu perfil e o… |
| [caixa_ocorrencias](#caixa_ocorrencias) | identificação | Ocorrências relatadas pelo responsável de um caixa físico (diferença de valor, perda, furto) e a resolução dada pelo Financeiro. Sem registr… |
| [caixa_prestacoes](#caixa_prestacoes) | identificação | Prestação de contas de um caixa físico aberta pelo responsável, com saldo declarado, e a decisão do Financeiro (aprovada, devolvida, desfeit… |
| [cartoes](#cartoes) | — | Cartões de pagamento da entidade (corporativos ou pré-pagos) usados como forma de pagamento em Compras; guarda apelido, bandeira, os últimos… |
| [centros_de_custo](#centros_de_custo) | — | Espelho de "Financeiro - Centros de custo" do Bubble |
| [danfes_ordens](#danfes_ordens) | — | Ligação entre recibos ou DANFEs do Bubble e ordens de pagamento. Sem uso encontrado no código (possível legado do Bubble), vazia. |
| [danfes_recibos](#danfes_recibos) | identificação | Recibos e DANFEs de fornecedores do Bubble ligados a compra ou contrato. Sem uso encontrado no código (possível legado do Bubble), vazia. |
| [despesas](#despesas) | financeiro, identificação | Espelho vazio de Financeiro - Despesas do Bubble (migração inicial). Sem uso encontrado no código (possível legado do Bubble); as despesas v… |
| [financeiro_caixa](#financeiro_caixa) | financeiro, identificação | Movimentações de caixa do modelo do Bubble (dono da conta, aportes, transferências). Sem uso encontrado no código (possível legado do Bubble… |
| [financeiro_cartao_faturas](#financeiro_cartao_faturas) | identificação | Faturas dos cartões de crédito da entidade: as compras pagas com o cartão entram na fatura aberta; no fechamento o Financeiro informa o valo… |
| [financeiro_config](#financeiro_config) | — | Configurações do Financeiro por tenant: centro de custo do caixa, prazo de estorno e regra de autorização das remessas de diárias. |
| [financeiro_contas_bancarias](#financeiro_contas_bancarias) | — | Contas bancárias da própria entidade usadas para gerar remessas CNAB de pagamento, com convênio, layout e sequência de remessa. |
| [financeiro_despesas](#financeiro_despesas) | financeiro, identificação | Despesas do modelo do Bubble (favorecido, comprovantes). Sem uso encontrado no código (possível legado do Bubble), vazia. |
| [financeiro_diarias](#financeiro_diarias) | — | Tipos de diária ou reembolso (alimentação, hospedagem, deslocamento) com valor de referência e quem pode lançar. Migrados do Bubble. |
| [financeiro_orcamentos](#financeiro_orcamentos) | — | Orçamento anual por centro de custo, informado na visão gerencial do Financeiro para comparar com o realizado. |
| [financeiro_remessa_itens](#financeiro_remessa_itens) | financeiro, identificação | Cada pagamento incluído numa remessa CNAB: favorecido, dados bancários ou Pix, valor e o retorno do banco (ocorrência, valor e data pagos). |
| [financeiro_remessas](#financeiro_remessas) | financeiro, identificação | Arquivos de remessa CNAB 240 de pagamentos gerados pela entidade e o retorno do banco importado depois. |
| [ordens_pagamento](#ordens_pagamento) | financeiro, identificação, trabalhista | Ordens de pagamento da entidade (compras, contratos, diárias, reembolsos, RPA, folha, custeios): beneficiário, valor, forma, autorização, pa… |
| [ordens_pagamento_estornos](#ordens_pagamento_estornos) | financeiro, identificação | Estorno de um pagamento já feito (devolvido pelo banco ou pelo favorecido): comunicado, responsável e como foi resolvido. |
| [ordens_pagamento_eventos](#ordens_pagamento_eventos) | financeiro, identificação | Linha do tempo de uma ordem de pagamento: criada, editada, autorizada, devolvida, paga, cancelada, com quem fez e detalhes. |
| [ordens_pagamento_rateio](#ordens_pagamento_rateio) | — | Divisão de UMA ordem de pagamento entre contas contábeis. Vazio = a ordem toda é do centro_custo_despesa_id dela. |
| [ordens_pagamento_verificacoes](#ordens_pagamento_verificacoes) | — | Apontamentos da auditoria automática de cada ordem de pagamento (regra, severidade, situação), exibidos antes de autorizar. |

## banco_extratos

Cada registro é um extrato bancário da entidade importado na conciliação (OFX ou CSV), com conta, período, saldo final e quantos lançamentos novos trouxe.

- **LGPD:** identificação
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `nome_arquivo` | text | sim |  |  |  |  |
| `origem` | text | não |  |  |  |  |
| `conta_rotulo` | text | sim |  |  |  | Rótulo da conta da entidade a que o extrato pertence. |
| `banco` | text | sim |  |  |  |  |
| `agencia` | text | sim |  |  |  |  |
| `conta` | text | sim |  |  |  |  |
| `periodo_de` | date | sim |  |  |  |  |
| `periodo_ate` | date | sim |  |  |  |  |
| `saldo_final` | numeric(14,2) | sim |  |  |  |  |
| `total_lancamentos` | integer | não | `0` |  |  |  |
| `novos_lancamentos` | integer | não | `0` |  |  |  |
| `importado_por` | uuid | sim |  |  | identificação | Usuário que importou. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `banco_extratos_origem_check` `CHECK ((origem = ANY (ARRAY['ofx'::text, 'csv'::text, 'api'::text])))`

Índices: `banco_extratos_emp_idx`, `banco_extratos_pkey`

## banco_lancamentos

Lançamentos de extrato bancário da entidade importados para conciliação; cada um pode ser ligado a uma ordem de pagamento, comprovação ou cobrança Pix de contribuição.

- **LGPD:** financeiro, identificação · titulares: filiados, fornecedores PF, funcionários (contrapartes de Pix e transferências)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `extrato_id` | uuid | não |  | → banco_extratos (**cascade**) |  |  |
| `data` | date | não |  |  |  |  |
| `valor` | numeric(14,2) | não |  |  |  |  |
| `descricao` | text | sim |  |  | financeiro | Histórico do banco; costuma trazer nome e às vezes CPF do pagador ou favorecido de Pix e TED. |
| `documento` | text | sim |  |  |  | Número do documento informado pelo banco. |
| `tipo` | text | sim |  |  |  |  |
| `chave` | text | não |  |  |  | Chave de deduplicação calculada de data, valor, descrição, documento e conta; não é chave Pix. |
| `situacao` | text | não | `'pendente'::text` |  |  | pendente, conciliado ou ignorado. |
| `ordem_id` | uuid | sim |  | → ordens_pagamento (set null) |  |  |
| `comprovacao_id` | uuid | sim |  | → filiacao_recebe_comprovacao (set null) |  | Comprovação de pagamento a que o lançamento foi ligado. |
| `automatico` | boolean | não | `false` |  |  | Conciliado automaticamente pelo sistema. |
| `observacao` | text | sim |  |  | identificação |  |
| `conciliado_em` | timestamp with time zone | sim |  |  |  |  |
| `conciliado_por` | uuid | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `cobranca_id` | uuid | sim |  | → filiacao_cobrancas (set null) |  | Cobrança Pix de contribuição baixada por este lançamento. |

Únicas: `UNIQUE (emp_proprietaria_id, chave)`

Checks: `banco_lancamentos_situacao_check` `CHECK ((situacao = ANY (ARRAY['pendente'::text, 'conciliado'::text, 'ignorado'::text])))`

Índices: `banco_lancamentos_comprovacao_idx`, `banco_lancamentos_emp_proprietaria_id_chave_key`, `banco_lancamentos_ordem_idx`, `banco_lancamentos_pkey`, `banco_lancamentos_situacao_idx`

## caixa_contas

Caixas físicos (dinheiro em espécie) sob responsabilidade de um usuário, com saldo controlado pelas movimentações. Criados em Financeiro, Caixas.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `responsavel_usuario_id` | uuid | não |  | → usuarios | identificação | Usuário que guarda o dinheiro e presta contas. |
| `nome` | text | não |  |  |  |  |
| `situacao` | text | não | `'fechada'::text` |  |  |  |
| `ativa` | boolean | não | `true` |  |  |  |
| `criada_por_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `caixa_contas_pkey`, `caixa_contas_responsavel_idx`

## caixa_movimentacoes

Entradas e saídas de um caixa físico: aportes, despesas pagas em espécie, transferências entre caixas. O responsável lança no Meu perfil e o Financeiro reconhece ou recusa.

- **LGPD:** financeiro, identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `conta_id` | uuid | não |  | → caixa_contas |  |  |
| `tipo` | text | não |  |  |  |  |
| `situacao` | text | não | `'confirmada'::text` |  |  | Estado da movimentação: pendente, confirmada, recusada etc. |
| `valor` | numeric(15,2) | não |  |  |  |  |
| `descricao` | text | sim |  |  | identificação |  |
| `criada_por_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `confirmada_em` | timestamp with time zone | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `reconhecimento` | text | sim |  |  |  | Avaliação do Financeiro sobre a despesa: reconhecida ou nao_reconhecida. |
| `reconhecimento_por_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `reconhecimento_em` | timestamp with time zone | sim |  |  |  |  |
| `reconhecimento_motivo` | text | sim |  |  | identificação |  |
| `transferida_de_mov_id` | uuid | sim |  | → caixa_movimentacoes |  | Movimentação de origem quando o valor veio de outro caixa. |

Checks: `caixa_movimentacoes_reconhecimento_chk` `CHECK (((reconhecimento IS NULL) OR (reconhecimento = ANY (ARRAY['pendente'::text, 'reconhecida'::text, 'nao_reconhecida'::text, 'transferida'::text]))))`

Índices: `caixa_movimentacoes_conta_idx`, `caixa_movimentacoes_pkey`, `caixa_movimentacoes_reconhecimento_idx`

## caixa_ocorrencias

Ocorrências relatadas pelo responsável de um caixa físico (diferença de valor, perda, furto) e a resolução dada pelo Financeiro. Sem registros em produção.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `conta_id` | uuid | não |  | → caixa_contas |  |  |
| `descricao` | text | não |  |  | identificação |  |
| `valor` | numeric(15,2) | sim |  |  |  |  |
| `situacao` | text | não | `'aberta'::text` |  |  |  |
| `resolucao` | text | sim |  |  | identificação |  |
| `relatada_por_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `resolvida_por_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `resolvida_em` | timestamp with time zone | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `caixa_ocorrencias_conta_idx`, `caixa_ocorrencias_pkey`

## caixa_prestacoes

Prestação de contas de um caixa físico aberta pelo responsável, com saldo declarado, e a decisão do Financeiro (aprovada, devolvida, desfeita).

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `conta_id` | uuid | não |  | → caixa_contas |  |  |
| `situacao` | text | não | `'aguardando'::text` |  |  |  |
| `observacao` | text | sim |  |  | identificação | Observação do responsável pelo caixa. |
| `observacao_financeiro` | text | sim |  |  | identificação | Parecer do Financeiro. |
| `saldo_declarado` | numeric(15,2) | sim |  |  |  | Saldo em espécie informado pelo responsável. |
| `aberta_por_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `decidida_por_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `decidida_em` | timestamp with time zone | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `caixa_prestacoes_conta_idx`, `caixa_prestacoes_pkey`

## cartoes

Cartões de pagamento da entidade (corporativos ou pré-pagos) usados como forma de pagamento em Compras; guarda apelido, bandeira, os últimos dígitos e o usuário portador.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `apelido` | text | não |  |  |  |  |
| `tipo` | text | não | `'credito'::text` |  |  |  |
| `bandeira` | text | sim |  |  |  |  |
| `final` | text | não |  |  |  | Últimos dígitos do cartão da entidade, só para identificação. |
| `titular_usuario_id` | uuid | sim |  | → usuarios |  | Usuário que porta o cartão corporativo. |
| `ativo` | boolean | não | `true` |  |  |  |
| `criado_por_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `cartoes_final_check` `CHECK ((final ~ '^[0-9]{4}$'::text))`; `cartoes_tipo_check` `CHECK ((tipo = ANY (ARRAY['credito'::text, 'debito'::text, 'pre_pago'::text])))`

Índices: `cartoes_pkey`, `cartoes_tenant_idx`

## centros_de_custo

Espelho de "Financeiro - Centros de custo" do Bubble

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome_da_conta` | text | sim |  |  |  |  |
| `acesso` | text | sim |  |  |  | Quem pode usar a conta (texto do Bubble). |
| `indicacoes` | text | sim |  |  |  | Campo "Indicações" — texto livre no Bubble, sem uso identificado ainda |
| `usavel` | boolean | sim |  |  |  | Conta analítica que aceita lançamentos. |
| `classificador` | text | sim |  |  |  | Código contábil hierárquico da conta. |
| `tipo_da_conta` | text | sim |  |  |  | Despesa ou receita. |
| `contraindicacoes` | text | sim |  |  |  | Campo "Contraindicações" — texto livre no Bubble, sem uso identificado ainda |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `centros_de_custo_bubble_id_key`, `centros_de_custo_pkey`

## danfes_ordens

Ligação entre recibos ou DANFEs do Bubble e ordens de pagamento. Sem uso encontrado no código (possível legado do Bubble), vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `danfe_id` | uuid | não |  | → danfes_recibos (**cascade**) |  |  |
| 🔑 `ordem_id` | uuid | não |  | → ordens_pagamento (**cascade**) |  |  |

Índices: `danfes_ordens_pkey`

## danfes_recibos

Recibos e DANFEs de fornecedores do Bubble ligados a compra ou contrato. Sem uso encontrado no código (possível legado do Bubble), vazia.

- **LGPD:** identificação · titulares: fornecedores PF
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `arquivo` | text | sim |  |  | identificação | Recibo pode trazer nome e CPF de fornecedor PF. |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `compra_id` | uuid | sim |  | → compras_solicitacao |  |  |
| `contrato_id` | uuid | sim |  | → contratos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `danfes_recibos_bubble_id_key`, `danfes_recibos_pkey`

## despesas

Espelho vazio de Financeiro - Despesas do Bubble (migração inicial). Sem uso encontrado no código (possível legado do Bubble); as despesas vivem nas ordens de pagamento.

- **LGPD:** financeiro, identificação · titulares: favorecidos pessoa física
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `valor` | numeric | sim |  |  | financeiro | Valor pago ao favorecido. |
| `favorecido` | text | sim |  |  | identificação | Nome do favorecido, pode ser pessoa física. |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `previsao_pagamento` | date | sim |  |  |  |  |
| `comprovante_despesa_url` | text | sim |  |  |  | URL do arquivo no Bubble CDN -- TODO: migrar para Supabase Storage |
| `comprovante_pagamento_url` | text | sim |  |  | financeiro | URL do arquivo no Bubble CDN -- TODO: migrar para Supabase Storage |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `ordem_pagamento_raw` | text | sim |  |  |  | Valor original do campo texto "Ordem de pagamento" no Bubble -- TODO: normalizar |

Únicas: `UNIQUE (bubble_id)`

Índices: `despesas_bubble_id_key`, `despesas_pkey`

## financeiro_caixa

Movimentações de caixa do modelo do Bubble (dono da conta, aportes, transferências). Sem uso encontrado no código (possível legado do Bubble), substituída por caixa_movimentacoes; vazia.

- **LGPD:** financeiro, identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `valor_lancamento` | numeric(15,2) | sim |  |  |  |  |
| `saldo_atual` | numeric(15,2) | sim |  |  |  |  |
| `movimentacao_data` | date | sim |  |  |  |  |
| `movimentacao` | text | sim |  |  |  | Descrição ou tipo da movimentação no Bubble. |
| `baixado` | boolean | sim | `false` |  |  |  |
| `transferencia` | boolean | sim | `false` |  |  |  |
| `transf_base` | boolean | sim | `false` |  |  |  |
| `transf_aceita` | boolean | sim | `false` |  |  |  |
| `transf_avalia_data` | date | sim |  |  |  |  |
| `dono_conta_id` | uuid | sim |  | → usuarios | identificação |  |
| `transf_aportador_id` | uuid | sim |  | → usuarios | identificação |  |
| `transf_recebedor_id` | uuid | sim |  | → usuarios | identificação |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `transferencia_origem_id` | uuid | sim |  | → financeiro_caixa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `financeiro_caixa_bubble_id_key`, `financeiro_caixa_pkey`

## financeiro_cartao_faturas

Faturas dos cartões de crédito da entidade: as compras pagas com o cartão entram na fatura aberta; no fechamento o Financeiro informa o valor, anexa a fatura e gera uma ordem de pagamento rateada pelos centros de custo das compras (src/lib/db/cartao-faturas.ts).

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `cartao_id` | uuid | não |  | → cartoes |  | Cartão de crédito da fatura. |
| `numero` | integer | não |  |  |  | Sequência da fatura no cartão (1, 2, 3…). |
| `situacao` | text | não | `'aberta'::text` |  |  | aberta (recebe compras; só uma por cartão) ou fechada (gerou a ordem de pagamento). |
| `aberta_em` | timestamp with time zone | não | `now()` |  |  | Quando a fatura passou a receber compras. |
| `fechada_em` | timestamp with time zone | sim |  |  |  | Quando o Financeiro fechou a fatura. |
| `fechada_por_usuario_id` | uuid | sim |  | → usuarios | identificação | Quem fechou a fatura. |
| `valor_fatura` | numeric(12,2) | sim |  |  |  | Valor da fatura informado no fechamento (pode diferir da soma das compras: juros, IOF, anuidade, estornos). |
| `vencimento` | date | sim |  |  |  | Vencimento da fatura (vira o vencimento da ordem). |
| `arquivo_fatura` | text | sim |  |  |  | Caminho do PDF da fatura no bucket compras (faturas-cartao/...). |
| `centro_diferenca_id` | uuid | sim |  | → centros_de_custo |  | Centro de custo da diferença entre o valor da fatura e a soma das compras. |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento (set null) |  | Ordem de pagamento gerada no fechamento. |
| `observacao` | text | sim |  |  |  | Observação de quem fechou (ex.: o que explica a diferença). |
| `created_at` | timestamp with time zone | não | `now()` |  |  | Criação do registro. |

Únicas: `UNIQUE (cartao_id, numero)`

Checks: `financeiro_cartao_faturas_situacao_check` `CHECK ((situacao = ANY (ARRAY['aberta'::text, 'fechada'::text])))`

Índices: `financeiro_cartao_faturas_numero_unico`, `financeiro_cartao_faturas_pkey`, `financeiro_cartao_faturas_tenant_idx`, `financeiro_cartao_faturas_uma_aberta`

## financeiro_config

Configurações do Financeiro por tenant: centro de custo do caixa, prazo de estorno e regra de autorização das remessas de diárias.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `centro_custo_caixa_id` | uuid | sim |  | → centros_de_custo |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `estorno_prazo_dias` | integer | não | `15` |  |  | Prazo em dias para resolver um estorno de pagamento. |
| `diarias_autorizacao` | text | não | `'remessa'::text` |  |  | Autorização da ordem da remessa de diárias: remessa (quem aprova a remessa autoriza, sem alçada) \| alcada (depende da alçada de quem aprova; acima dela, fila de autorização). |

Checks: `financeiro_config_diarias_autorizacao_chk` `CHECK ((diarias_autorizacao = ANY (ARRAY['remessa'::text, 'alcada'::text])))`; `financeiro_config_estorno_prazo_chk` `CHECK (((estorno_prazo_dias >= 1) AND (estorno_prazo_dias <= 365)))`

Índices: `financeiro_config_pkey`

## financeiro_contas_bancarias

Contas bancárias da própria entidade usadas para gerar remessas CNAB de pagamento, com convênio, layout e sequência de remessa.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `apelido` | text | não |  |  |  |  |
| `banco_codigo` | text | não |  |  |  |  |
| `banco_nome` | text | sim |  |  |  |  |
| `agencia` | text | não |  |  |  |  |
| `agencia_dv` | text | sim |  |  |  |  |
| `conta` | text | não |  |  |  |  |
| `conta_dv` | text | sim |  |  |  |  |
| `tipo_conta` | text | não | `'corrente'::text` |  |  |  |
| `convenio` | text | sim |  |  |  | Código do convênio CNAB junto ao banco. |
| `layout_versao_arquivo` | text | sim |  |  |  | Versão do layout CNAB 240 do arquivo. |
| `layout_versao_lote` | text | sim |  |  |  | Versão do layout CNAB 240 do lote. |
| `titular_nome` | text | sim |  |  |  |  |
| `titular_documento` | text | sim |  |  |  | CNPJ da entidade titular. |
| `pix_chave` | text | sim |  |  |  |  |
| `centro_custo_id` | uuid | sim |  | → centros_de_custo (set null) |  |  |
| `sequencia_remessa` | integer | não | `0` |  |  | Último número sequencial de remessa gerado. |
| `ativa` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `financeiro_contas_bancarias_emp_idx`, `financeiro_contas_bancarias_pkey`

## financeiro_despesas

Despesas do modelo do Bubble (favorecido, comprovantes). Sem uso encontrado no código (possível legado do Bubble), vazia.

- **LGPD:** financeiro, identificação · titulares: fornecedores PF, funcionários
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `valor` | numeric(15,2) | sim |  |  |  |  |
| `favorecido` | text | sim |  |  | identificação |  |
| `ordem_pagamento` | text | sim |  |  |  |  |
| `previsao_pagamento` | date | sim |  |  |  |  |
| `comprovante_despesa` | text | sim |  |  | financeiro |  |
| `comprovante_pagamento` | text | sim |  |  | financeiro |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `financeiro_despesas_bubble_id_key`, `financeiro_despesas_pkey`

## financeiro_diarias

Tipos de diária ou reembolso (alimentação, hospedagem, deslocamento) com valor de referência e quem pode lançar. Migrados do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `diaria` | diaria_enum | não |  |  |  | Categoria da diária (enum do Bubble). |
| `valor_reembolso` | numeric(15,2) | sim |  |  |  | Valor padrão do tipo. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `ativa` | boolean | não | `true` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `descricao` | text | sim |  |  |  |  |
| `permanente` | boolean | sim |  |  |  | Tipo sempre disponível, sem vigência. |
| `usuarios_autorizados` | uuid[] | não | `'{}'::uuid[]` |  |  | Quem pode lançar este tipo (Bubble: USUARIOS AUTORIZADOS). Vazio = todos. |
| `quadro` | text | não | `'funcionario'::text` |  |  | Quem pode usar este tipo: funcionario \| diretor \| ambos. Os tipos antigos ficam como funcionario. |

Únicas: `UNIQUE (bubble_id)`

Checks: `financeiro_diarias_quadro_check` `CHECK ((quadro = ANY (ARRAY['funcionario'::text, 'diretor'::text, 'ambos'::text])))`

Índices: `financeiro_diarias_bubble_id_key`, `financeiro_diarias_pkey`

## financeiro_orcamentos

Orçamento anual por centro de custo, informado na visão gerencial do Financeiro para comparar com o realizado.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `ano` | integer | não |  |  |  |  |
| `centro_custo_id` | uuid | não |  | → centros_de_custo (**cascade**) |  |  |
| `valor_anual` | numeric(14,2) | não |  |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `atualizado_por` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, ano, centro_custo_id)`

Checks: `financeiro_orcamentos_ano_check` `CHECK (((ano >= 2000) AND (ano <= 2100)))`; `financeiro_orcamentos_valor_anual_check` `CHECK ((valor_anual >= (0)::numeric))`

Índices: `financeiro_orcamentos_emp_ano_idx`, `financeiro_orcamentos_emp_proprietaria_id_ano_centro_custo__key`, `financeiro_orcamentos_pkey`

## financeiro_remessa_itens

Cada pagamento incluído numa remessa CNAB: favorecido, dados bancários ou Pix, valor e o retorno do banco (ocorrência, valor e data pagos).

- **LGPD:** financeiro, identificação · titulares: fornecedores PF, funcionários, diretores, filiados (favorecidos)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `remessa_id` | uuid | não |  | → financeiro_remessas (**cascade**) |  |  |
| `ordem_id` | uuid | não |  | → ordens_pagamento (**cascade**) |  |  |
| `seq` | integer | não |  |  |  |  |
| `segmento` | text | não |  |  |  | Segmento CNAB 240 (A, J, O etc.). |
| `forma_lancamento` | text | não |  |  |  | Código CNAB da forma: TED, Pix, boleto, crédito em conta. |
| `favorecido_nome` | text | sim |  |  | identificação |  |
| `favorecido_documento` | text | sim |  |  | identificação | CPF ou CNPJ do favorecido. |
| `banco_codigo` | text | sim |  |  | financeiro |  |
| `agencia` | text | sim |  |  | financeiro |  |
| `conta` | text | sim |  |  | financeiro |  |
| `pix_chave` | text | sim |  |  | financeiro |  |
| `codigo_barras` | text | sim |  |  |  |  |
| `valor` | numeric(14,2) | não |  |  | financeiro |  |
| `data_pagamento` | date | não |  |  |  |  |
| `situacao` | text | não | `'enviado'::text` |  |  |  |
| `ocorrencia` | text | sim |  |  |  | Código de ocorrência devolvido no retorno do banco. |
| `ocorrencia_descricao` | text | sim |  |  |  |  |
| `retorno_valor` | numeric(14,2) | sim |  |  |  |  |
| `retorno_data` | date | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (remessa_id, ordem_id)`

Checks: `financeiro_remessa_itens_segmento_check` `CHECK ((segmento = ANY (ARRAY['A'::text, 'J'::text])))`; `financeiro_remessa_itens_situacao_check` `CHECK ((situacao = ANY (ARRAY['enviado'::text, 'pago'::text, 'rejeitado'::text, 'cancelado'::text])))`

Índices: `financeiro_remessa_itens_ordem_idx`, `financeiro_remessa_itens_pkey`, `financeiro_remessa_itens_remessa_id_ordem_id_key`

## financeiro_remessas

Arquivos de remessa CNAB 240 de pagamentos gerados pela entidade e o retorno do banco importado depois.

- **LGPD:** financeiro, identificação · titulares: fornecedores PF, funcionários, diretores, filiados (favorecidos)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `conta_bancaria_id` | uuid | não |  | → financeiro_contas_bancarias (restrict) |  |  |
| `numero` | integer | não |  |  |  |  |
| `arquivo_nome` | text | não |  |  |  |  |
| `conteudo` | text | não |  |  | financeiro | Texto integral do arquivo CNAB, com nome, CPF, banco, agência, conta e valor de cada favorecido. |
| `total_itens` | integer | não | `0` |  |  |  |
| `total_valor` | numeric(14,2) | não | `0` |  |  |  |
| `situacao` | text | não | `'gerada'::text` |  |  |  |
| `gerada_por` | uuid | sim |  |  |  |  |
| `enviada_em` | timestamp with time zone | sim |  |  |  |  |
| `retorno_nome` | text | sim |  |  |  |  |
| `retorno_conteudo` | text | sim |  |  | financeiro | Texto integral do arquivo de retorno, mesmos dados. |
| `retorno_em` | timestamp with time zone | sim |  |  |  |  |
| `retorno_por` | uuid | sim |  |  |  |  |
| `retorno_resumo` | jsonb | sim |  |  |  | Contagem de pagas e rejeitadas no retorno. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (conta_bancaria_id, numero)`

Checks: `financeiro_remessas_situacao_check` `CHECK ((situacao = ANY (ARRAY['gerada'::text, 'enviada'::text, 'retornada'::text, 'cancelada'::text])))`

Índices: `financeiro_remessas_conta_bancaria_id_numero_key`, `financeiro_remessas_emp_idx`, `financeiro_remessas_pkey`

## ordens_pagamento

Ordens de pagamento da entidade (compras, contratos, diárias, reembolsos, RPA, folha, custeios): beneficiário, valor, forma, autorização, pagamento e anexos. Migradas do Bubble e geradas por vários módulos.

- **LGPD:** financeiro, identificação, trabalhista · titulares: fornecedores PF, funcionários, diretores, filiados, convidados (beneficiários)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  | financeiro | Pode citar o beneficiário e o motivo (reembolso, diária, salário). |
| `valor` | numeric(15,2) | sim |  |  | financeiro | Pessoal quando o beneficiário é pessoa física. |
| `data_emissao` | date | sim |  |  |  |  |
| `data_pagamento` | date | sim |  |  |  |  |
| `pago` | boolean | sim | `false` |  |  |  |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `arquivo_nota_fiscal` | text | sim |  |  | financeiro |  |
| `arquivo_orcamento` | text | sim |  |  | financeiro |  |
| `arquivo_pagamento` | text | sim |  |  | financeiro | Comprovante de pagamento com dados bancários do favorecido. |
| `arquivo_boleto` | text | sim |  |  | financeiro |  |
| `autorizacao_data` | date | sim |  |  |  |  |
| `autorizacao_esta_autorizado` | boolean | sim | `false` |  |  |  |
| `autorizacao_observacao` | text | sim |  |  | identificação |  |
| `centro_custo_despesa` | text | sim |  |  |  | Nome do centro de custo no Bubble, legado; o atual é centro_custo_despesa_id. |
| `centro_custo_receita` | text | sim |  |  |  | Nome do centro de receita no Bubble, legado. |
| `excluido` | boolean | sim | `false` |  |  |  |
| `forma_pagamento` | text | sim |  |  |  |  |
| `pix_codigo` | text | sim |  |  | financeiro | Chave ou código Pix do favorecido. |
| `reembolso_pagamento` | text | sim |  |  | financeiro | Dados do reembolso do Bubble. |
| `situacao` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  | trabalhista | Origem da ordem; o tipo Folha de pagamento revela salário de funcionário. |
| `valor_inicial_cobranca` | numeric(15,2) | sim |  |  |  | Valor original antes de juros, multa ou desconto. |
| `valor_pago` | numeric(15,2) | sim |  |  | financeiro |  |
| `vencimento` | date | sim |  |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `beneficiario_fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `beneficiario_usuario_id` | uuid | sim |  | → usuarios | identificação | Funcionário ou diretor beneficiário (diária, reembolso, folha). |
| `autorizacao_autorizador_id` | uuid | sim |  | → usuarios |  |  |
| `pagador_id` | uuid | sim |  | → usuarios | identificação | Usuário que efetuou o pagamento. |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `centro_custo_despesa_id` | uuid | sim |  | → centros_de_custo |  |  |
| `centro_custo_receita_id` | uuid | sim |  | → centros_de_custo |  |  |
| `processo_compra_id` | uuid | sim |  | → compras_solicitacoes |  |  |
| `contrato_id` | uuid | sim |  | → contratos |  |  |
| `contrato_aluguel_id` | uuid | sim |  | → veiculo_contratos_aluguel |  |  |
| `custeio_id` | uuid | sim |  | → institucional_custeios |  |  |
| `beneficiario_nome_avulso` | text | sim |  |  | identificação | Nome de beneficiário sem cadastro. |
| `beneficiario_doc_avulso` | text | sim |  |  | identificação | CPF ou CNPJ do beneficiário avulso. |
| `projeto_id` | uuid | sim |  | → projeto |  |  |
| `cartao_id` | uuid | sim |  | → cartoes |  |  |
| `caixa_conta_id` | uuid | sim |  | → caixa_contas |  |  |
| `dados_bancarios_id` | uuid | sim |  | → dados_bancarios | financeiro | Conta bancária do beneficiário usada no pagamento. |
| `forma_detalhe` | text | sim |  |  | financeiro | Detalhe da forma de pagamento (conta, chave). |
| `autorizacao_dispensada` | boolean | não | `false` |  |  | Ordem paga sem autorização formal, com motivo. |
| `autorizacao_dispensa_motivo` | text | sim |  |  |  |  |
| `cancelamento_motivo` | text | sim |  |  | identificação |  |
| `cancelado_em` | timestamp with time zone | sim |  |  |  |  |
| `cancelado_por_id` | uuid | sim |  | → usuarios |  |  |
| `boleto_linha_digitavel` | text | sim |  |  | financeiro |  |
| `fornecimento_id` | uuid | sim |  | → compras_fornecimentos (set null) |  |  |
| `cartao_fatura_id` | uuid | sim |  | → financeiro_cartao_faturas |  | Fatura do cartão de crédito a que pertence a ordem da compra; autorizada, a ordem fica "Na fatura" e é quitada pela ordem da fatura. |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_bub_ordens_pagamento`, `idx_ordens_beneficiario_fornecedor`, `idx_ordens_contrato`, `idx_ordens_contrato_aluguel`, `idx_ordens_custeio`, `idx_ordens_fornecedor`, `idx_ordens_processo_compra`, `idx_ordens_projeto`, `idx_ordens_tipo_situacao`, `ordens_pagamento_bubble_id_key`, `ordens_pagamento_cartao_fatura_idx`, `ordens_pagamento_emp_sit_pag_idx`, `ordens_pagamento_fornecimento_idx`, `ordens_pagamento_pkey`

## ordens_pagamento_estornos

Estorno de um pagamento já feito (devolvido pelo banco ou pelo favorecido): comunicado, responsável e como foi resolvido.

- **LGPD:** financeiro, identificação · titulares: fornecedores PF, funcionários, diretores (favorecidos)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `ordem_id` | uuid | não |  | → ordens_pagamento (**cascade**) |  |  |
| `data_estorno` | date | não |  |  |  |  |
| `motivo` | text | não |  |  | identificação |  |
| `arquivo_comunicado` | text | sim |  |  | financeiro | Comunicado do banco com dados do favorecido. |
| `registrado_por_id` | uuid | sim |  | → usuarios |  |  |
| `responsavel_id` | uuid | sim |  | → usuarios |  |  |
| `pagamento` | jsonb | não | `'{}'::jsonb` |  | financeiro | Fotografia do pagamento estornado (data, valor, forma, conta). |
| `resolvido_em` | timestamp with time zone | sim |  |  |  |  |
| `resolvido_por_id` | uuid | sim |  | → usuarios |  |  |
| `resolucao` | text | sim |  |  | identificação |  |
| `correcao` | jsonb | sim |  |  | financeiro | Nova forma ou conta informada para repagar. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `ordens_pagamento_estornos_ordem_idx`, `ordens_pagamento_estornos_pendentes_idx`, `ordens_pagamento_estornos_pkey`, `ordens_pagamento_estornos_um_pendente`

## ordens_pagamento_eventos

Linha do tempo de uma ordem de pagamento: criada, editada, autorizada, devolvida, paga, cancelada, com quem fez e detalhes.

- **LGPD:** financeiro, identificação · titulares: usuários do sistema, beneficiários das ordens
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `ordem_id` | uuid | não |  | → ordens_pagamento (**cascade**) |  |  |
| `tipo` | text | não |  |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios | identificação |  |
| `descricao` | text | sim |  |  | identificação |  |
| `dados` | jsonb | sim |  |  | financeiro | Detalhes do evento; pode trazer valores, forma e dados de pagamento. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `ordens_pagamento_eventos_ordem_idx`, `ordens_pagamento_eventos_pkey`

## ordens_pagamento_rateio

Divisão de UMA ordem de pagamento entre contas contábeis. Vazio = a ordem toda é do centro_custo_despesa_id dela.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `ordem_id` | uuid | não |  | → ordens_pagamento (**cascade**) |  |  |
| `centro_custo_despesa_id` | uuid | sim |  | → centros_de_custo |  |  |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `descricao` | text | sim |  |  |  |  |
| `valor` | numeric | não |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_ordens_rateio_ordem`, `ordens_pagamento_rateio_pkey`

## ordens_pagamento_verificacoes

Apontamentos da auditoria automática de cada ordem de pagamento (regra, severidade, situação), exibidos antes de autorizar.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `ordem_id` | uuid | não |  | → ordens_pagamento (**cascade**) |  |  |
| `origem` | text | não |  |  |  | Origem da ordem avaliada. |
| `codigo` | text | não |  |  |  | Regra que gerou o apontamento. |
| `titulo` | text | não |  |  |  |  |
| `severidade` | text | não |  |  |  |  |
| `status` | text | não |  |  |  | ok, alerta, bloqueio ou resolvido. |
| `detalhe` | text | sim |  |  |  | Explicação do apontamento; pode citar beneficiário. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `ordens_pagamento_verificacoes_ordem_idx`, `ordens_pagamento_verificacoes_pkey`
