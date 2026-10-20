<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Institucional, diárias, viagens e patrimônio

14 tabelas. Diagrama: [er/institucional.md](../er/institucional.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [estoque](#estoque) | — | Itens de estoque por depósito e sede, migrados do Bubble. Sem uso encontrado no código (possível legado do Bubble); tabela vazia. |
| [institucional_custeio_convidados](#institucional_custeio_convidados) | identificação, financeiro | Cadastro de convidados que recebem custeio institucional (palestrantes, apoiadores), com dados de contato e bancários para pagamento. |
| [institucional_custeio_finalidades](#institucional_custeio_finalidades) | — | Finalidades do custeio institucional (ex.: transporte, alimentação, assessoria) com conta contábil e tipo de beneficiário sugerido. |
| [institucional_custeios](#institucional_custeios) | identificação, financeiro, **sensível: sindical** | Custeio institucional pago a diretor, filiado, convidado ou fornecedor: finalidade, parcelas, dados de pagamento, autorização e formalização… |
| [linhas_institucionais](#linhas_institucionais) | identificação | Linhas de celular da entidade (número, operadora, chip) e com quem estão. Cadastro da área Institucional; parte migrada do Bubble. |
| [patrimonio_item](#patrimonio_item) | — | Bem patrimonial (número de patrimônio, recinto, notas de entrada e saída, responsável pela cautela). Migrado do Bubble. |
| [patrimonio_item_responsavel](#patrimonio_item_responsavel) | identificação | Histórico de cautela de bens: quem foi responsável por cada item e em que período, com o termo de cautela. Migrado do Bubble. |
| [patrimonio_nota_fiscal](#patrimonio_nota_fiscal) | — | Notas fiscais de entrada e saída de bens patrimoniais, com fornecedor e arquivo. Migradas do Bubble. |
| [patrimonio_recinto](#patrimonio_recinto) | — | Ambientes físicos das sedes (salas, auditórios) onde ficam os bens; base dos espaços de cessão. Migrado do Bubble. |
| [patrimonio_recinto_responsavel](#patrimonio_recinto_responsavel) | trabalhista | Funcionário responsável por cada recinto e período. Migrado do Bubble; usado em Patrimônio e Espaços. |
| [viagens_config](#viagens_config) | identificação | Configuração de Viagens por entidade (uma linha): aviso de pedidos novos, antecedência e orientações. |
| [viagens_faturas](#viagens_faturas) | — | Fatura de agência/operadora que cobre itens de viagem. Vira aquisição direta em Compras e ordem de pagamento com rateio. |
| [viagens_itens](#viagens_itens) | identificação, **sensível: saúde** | Cada trecho de passagem (aérea ou rodoviária) ou estadia de hospedagem de uma viagem. |
| [viagens_solicitacoes](#viagens_solicitacoes) | identificação | Pedido de viagem (passagens e/ou hospedagens) para diretor, funcionário ou convidado. Os trechos e estadias ficam em viagens_itens. |

## estoque

Itens de estoque por depósito e sede, migrados do Bubble. Sem uso encontrado no código (possível legado do Bubble); tabela vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `item` | text | sim |  |  |  |  |
| `deposito` | text | sim |  |  |  |  |
| `item_codigo` | text | sim |  |  |  |  |
| `sede` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `estoque_bubble_id_key`, `estoque_pkey`

## institucional_custeio_convidados

Cadastro de convidados que recebem custeio institucional (palestrantes, apoiadores), com dados de contato e bancários para pagamento.

- **LGPD:** identificação, financeiro · titulares: convidados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | não |  |  | identificação |  |
| `cpf` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `telefone` | text | sim |  |  | identificação |  |
| `banco` | text | sim |  |  | financeiro |  |
| `agencia` | text | sim |  |  | financeiro |  |
| `conta` | text | sim |  |  | financeiro |  |
| `tipo_conta` | text | sim |  |  | financeiro |  |
| `pix` | text | sim |  |  | financeiro |  |
| `tipo_chave_pix` | text | sim |  |  | financeiro |  |
| `observacoes` | text | sim |  |  | identificação | Texto livre sobre o convidado. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_custeio_convidados_emp`, `institucional_custeio_convidados_pkey`

## institucional_custeio_finalidades

Finalidades do custeio institucional (ex.: transporte, alimentação, assessoria) com conta contábil e tipo de beneficiário sugerido.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | não |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `tipo_beneficiario_sugerido` | text | não | `'livre'::text` |  |  |  |
| `centro_custo_despesa_id` | uuid | sim |  | → centros_de_custo |  |  |
| `ativa` | boolean | não | `true` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_custeio_finalidades_emp`, `institucional_custeio_finalidades_pkey`

## institucional_custeios

Custeio institucional pago a diretor, filiado, convidado ou fornecedor: finalidade, parcelas, dados de pagamento, autorização e formalização. Vira ordem de pagamento.

- **LGPD:** identificação, financeiro, **sensível: sindical** · titulares: diretores, filiados, convidados, fornecedores PF
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `codigo` | text | sim |  |  |  |  |
| `finalidade_id` | uuid | sim |  | → institucional_custeio_finalidades |  |  |
| `tipo_beneficiario` | text | não |  |  |  |  |
| `diretoria_integrante_id` | uuid | sim |  | → diretoria_integrantes |  | Beneficiário diretor. |
| `filiacao_id` | uuid | sim |  | → filiacoes | **sensível: sindical** | Beneficiário filiado. |
| `convidado_id` | uuid | sim |  | → institucional_custeio_convidados |  |  |
| `beneficiario_nome` | text | sim |  |  | identificação |  |
| `beneficiario_cpf` | text | sim |  |  | identificação |  |
| `banco` | text | sim |  |  | financeiro |  |
| `agencia` | text | sim |  |  | financeiro |  |
| `conta` | text | sim |  |  | financeiro |  |
| `tipo_conta` | text | sim |  |  | financeiro |  |
| `pix` | text | sim |  |  | financeiro |  |
| `tipo_chave_pix` | text | sim |  |  | financeiro |  |
| `descricao` | text | sim |  |  | identificação | Texto livre do custeio. |
| `evento` | text | sim |  |  |  |  |
| `centro_custo_despesa_id` | uuid | sim |  | → centros_de_custo |  |  |
| `cadencia` | text | não | `'pontual'::text` |  |  | Pagamento único ou parcelado. |
| `valor_parcela` | numeric | sim |  |  | financeiro | Valor pago à pessoa. |
| `num_parcelas` | integer | não | `1` |  |  |  |
| `periodicidade` | text | não | `'unica'::text` |  |  |  |
| `primeiro_vencimento` | date | sim |  |  |  |  |
| `forma_pagamento` | text | sim |  |  |  |  |
| `situacao` | text | não | `'rascunho'::text` |  |  |  |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `autorizador_id` | uuid | sim |  | → usuarios |  |  |
| `autorizado_em` | timestamp with time zone | sim |  |  |  |  |
| `motivo_reprovacao` | text | sim |  |  |  |  |
| `excluido` | boolean | não | `false` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `pix_codigo` | text | sim |  |  | financeiro | Código Pix copia e cola. |
| `caixa_conta_id` | uuid | sim |  | → caixa_contas |  |  |
| `arquivo_boleto` | text | sim |  |  | financeiro |  |
| `conta_favorecido` | text | sim |  |  | financeiro |  |
| `arquivo_formalizacao` | text | sim |  |  |  | Documento que formaliza o custeio (convite, ata, ofício, termo) — bucket compras. |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `cancelamento_motivo` | text | sim |  |  |  | Motivo do cancelamento do custeio (pelo Custeio ou, quando todas as ordens foram canceladas, pelo Financeiro). |
| `cancelado_em` | timestamp with time zone | sim |  |  |  | Quando o custeio foi cancelado. |
| `cancelado_por_id` | uuid | sim |  | → usuarios |  | Quem cancelou o custeio (ou a última ordem dele no Financeiro). |

Índices: `idx_custeios_emp`, `idx_custeios_finalidade`, `idx_custeios_fornecedor`, `idx_custeios_situacao`, `institucional_custeios_pkey`

## linhas_institucionais

Linhas de celular da entidade (número, operadora, chip) e com quem estão. Cadastro da área Institucional; parte migrada do Bubble.

- **LGPD:** identificação · titulares: funcionários e diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `numero` | text | não |  |  | identificação | Só dígitos, com DDD (ex.: 22981151126). |
| `operadora` | text | sim |  |  |  |  |
| `chip` | text | sim |  |  |  | Número do chip (ICCID), só dígitos. |
| `usuario_id` | uuid | sim |  | → usuarios (set null) |  | Com quem a linha está (funcionário ou diretor). |
| `observacao` | text | sim |  |  | identificação | Texto livre. |
| `bubble_id` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_linhas_institucionais_usuario`, `linhas_institucionais_pkey`, `uq_linhas_institucionais_bubble`, `uq_linhas_institucionais_numero`

## patrimonio_item

Bem patrimonial (número de patrimônio, recinto, notas de entrada e saída, responsável pela cautela). Migrado do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `numero_patrimonio` | text | sim |  |  |  |  |
| `numero_patrimonio_antigo` | text | sim |  |  |  |  |
| `numero_unico` | text | sim |  |  |  | Número de série ou identificador único do bem. |
| `ativo` | boolean | não | `true` |  |  |  |
| `recinto_id` | uuid | sim |  | → patrimonio_recinto |  |  |
| `nota_fiscal_entrada_id` | uuid | sim |  | → patrimonio_nota_fiscal |  |  |
| `nota_fiscal_saida_id` | uuid | sim |  | → patrimonio_nota_fiscal |  |  |
| `responsavel_cautela_id` | uuid | sim |  | → usuarios |  | Pessoa com a cautela atual do bem. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_patrimonio_item_ativo`, `idx_patrimonio_item_nf_entrada`, `idx_patrimonio_item_nf_saida`, `idx_patrimonio_item_numero`, `idx_patrimonio_item_recinto`, `patrimonio_item_bubble_id_key`, `patrimonio_item_pkey`

## patrimonio_item_responsavel

Histórico de cautela de bens: quem foi responsável por cada item e em que período, com o termo de cautela. Migrado do Bubble.

- **LGPD:** identificação · titulares: funcionários e diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `item_id` | uuid | não |  | → patrimonio_item |  |  |
| `responsavel_id` | uuid | sim |  | → usuarios |  |  |
| `inicio` | date | sim |  |  |  |  |
| `termino` | date | sim |  |  |  |  |
| `arquivo_cautela` | text | sim |  |  | identificação | Termo de cautela assinado pelo responsável. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_patrimonio_item_resp_abertas`, `idx_patrimonio_item_resp_item`, `idx_patrimonio_item_resp_responsavel`, `patrimonio_item_responsavel_bubble_id_key`, `patrimonio_item_responsavel_pkey`

## patrimonio_nota_fiscal

Notas fiscais de entrada e saída de bens patrimoniais, com fornecedor e arquivo. Migradas do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `entrada` | boolean | sim | `false` |  |  |  |
| `numero_nota` | text | sim |  |  |  |  |
| `arquivo_nota` | text | sim |  |  |  |  |
| `data_emissao` | date | sim |  |  |  |  |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_patrimonio_nf_fornecedor`, `patrimonio_nota_fiscal_bubble_id_key`, `patrimonio_nota_fiscal_pkey`

## patrimonio_recinto

Ambientes físicos das sedes (salas, auditórios) onde ficam os bens; base dos espaços de cessão. Migrado do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome_recinto` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `descricao_fisica` | text | sim |  |  |  |  |
| `sede` | sedes_enum | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_patrimonio_recinto_sede`, `patrimonio_recinto_bubble_id_key`, `patrimonio_recinto_pkey`

## patrimonio_recinto_responsavel

Funcionário responsável por cada recinto e período. Migrado do Bubble; usado em Patrimônio e Espaços.

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `recinto_id` | uuid | não |  | → patrimonio_recinto |  |  |
| `funcionario_id` | uuid | sim |  | → usuarios | trabalhista | Atribuição de responsabilidade a um funcionário. |
| `inicio` | date | sim |  |  |  |  |
| `termino` | date | sim |  |  |  |  |
| `atual` | boolean | não | `false` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_patrimonio_recinto_resp_atual`, `idx_patrimonio_recinto_resp_funcionario`, `idx_patrimonio_recinto_resp_recinto`, `patrimonio_recinto_responsavel_bubble_id_key`, `patrimonio_recinto_responsavel_pkey`

## viagens_config

Configuração de Viagens por entidade (uma linha): aviso de pedidos novos, antecedência e orientações.

- **LGPD:** identificação · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `emails_aviso` | text | sim |  |  | identificação | E-mails que recebem aviso de pedido novo. |
| `antecedencia_dias` | integer | sim |  |  |  |  |
| `orientacoes` | text | sim |  |  |  |  |
| `updated_by` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `viagens_config_antecedencia_dias_check` `CHECK (((antecedencia_dias IS NULL) OR ((antecedencia_dias >= 0) AND (antecedencia_dias <= 365))))`

Índices: `ux_viagens_config_emp`, `viagens_config_pkey`

## viagens_faturas

Fatura de agência/operadora que cobre itens de viagem. Vira aquisição direta em Compras e ordem de pagamento com rateio.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `fornecedor_id` | uuid | não |  | → empresa |  |  |
| `numero` | text | não |  |  |  |  |
| `emissao` | date | não |  |  |  |  |
| `vencimento` | date | sim |  |  |  |  |
| `forma_pagamento` | text | sim |  |  |  |  |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `valor_itens` | numeric | não |  |  |  |  |
| `valor_taxas` | numeric | não | `0` |  |  |  |
| `valor_total` | numeric | não |  |  |  |  |
| `arquivo` | text | não |  |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `processo_compra_id` | uuid | sim |  | → compras_solicitacoes (set null) |  |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento (set null) |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `viagens_faturas_valor_itens_check` `CHECK ((valor_itens >= (0)::numeric))`; `viagens_faturas_valor_taxas_check` `CHECK ((valor_taxas >= (0)::numeric))`; `viagens_faturas_valor_total_check` `CHECK ((valor_total > (0)::numeric))`

Índices: `idx_viagens_faturas_emp`, `ux_viagens_faturas_numero`, `viagens_faturas_pkey`

## viagens_itens

Cada trecho de passagem (aérea ou rodoviária) ou estadia de hospedagem de uma viagem.

- **LGPD:** identificação, **sensível: saúde** · titulares: viajantes (diretores, funcionários, convidados)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `solicitacao_id` | uuid | não |  | → viagens_solicitacoes (**cascade**) |  |  |
| `tipo` | text | não |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `modal` | text | sim |  |  |  |  |
| `origem` | text | sim |  |  | identificação |  |
| `destino` | text | sim |  |  | identificação |  |
| `data_viagem` | date | sim |  |  | identificação |  |
| `saida_criterio` | text | sim |  |  |  | ate = sair no máximo até saida_hora; depois = sair a partir de saida_hora. |
| `saida_hora` | time without time zone | sim |  |  |  |  |
| `chegada_criterio` | text | sim |  |  |  |  |
| `chegada_hora` | time without time zone | sim |  |  |  |  |
| `bagagem_extra` | boolean | não | `false` |  |  |  |
| `bagagem_descricao` | text | sim |  |  |  |  |
| `cidade` | text | sim |  |  |  |  |
| `checkin` | date | sim |  |  |  |  |
| `checkout` | date | sim |  |  |  |  |
| `necessidades_especiais` | text | sim |  |  | **sensível: saúde** | Necessidades especiais do viajante (mobilidade, deficiência). |
| `observacoes` | text | sim |  |  | identificação | Texto livre. |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `localizador` | text | sim |  |  | identificação | Localizador da reserva, ligado à pessoa. |
| `reserva_descricao` | text | sim |  |  |  |  |
| `valor` | numeric | sim |  |  |  |  |
| `voucher` | text | sim |  |  | identificação | Voucher ou bilhete com nome do viajante. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `fatura_id` | uuid | sim |  | → viagens_faturas (set null) |  |  |
| `centro_custo_id` | uuid | sim |  | → centros_de_custo |  | Conta em que o item foi faturado (a sugerida pelo de-para ou a escolhida na fatura). |

Checks: `viagens_itens_chegada_criterio_check` `CHECK ((chegada_criterio = ANY (ARRAY['ate'::text, 'depois'::text])))`; `viagens_itens_hospedagem_check` `CHECK (((tipo <> 'hospedagem'::text) OR ((cidade IS NOT NULL) AND (checkin IS NOT NULL) AND (checkout IS NOT NULL) AND (checkout > checkin))))`; `viagens_itens_modal_check` `CHECK ((modal = ANY (ARRAY['aerea'::text, 'rodoviaria'::text])))`; `viagens_itens_passagem_check` `CHECK (((tipo <> 'passagem'::text) OR ((modal IS NOT NULL) AND (origem IS NOT NULL) AND (destino IS NOT NULL) AND (data_viagem IS NOT NULL))))`; `viagens_itens_saida_criterio_check` `CHECK ((saida_criterio = ANY (ARRAY['ate'::text, 'depois'::text])))`; `viagens_itens_tipo_check` `CHECK ((tipo = ANY (ARRAY['passagem'::text, 'hospedagem'::text])))`; `viagens_itens_valor_check` `CHECK (((valor IS NULL) OR (valor >= (0)::numeric)))`

Índices: `idx_viagens_itens_fatura`, `idx_viagens_itens_solicitacao`, `idx_viagens_itens_tipo`, `viagens_itens_pkey`

## viagens_solicitacoes

Pedido de viagem (passagens e/ou hospedagens) para diretor, funcionário ou convidado. Os trechos e estadias ficam em viagens_itens.

- **LGPD:** identificação · titulares: diretores, funcionários, convidados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `numero` | bigint | não |  |  |  |  |
| `beneficiario_tipo` | text | não |  |  |  | diretor, funcionario ou convidado. |
| `beneficiario_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `convidado_nome` | text | sim |  |  | identificação |  |
| `convidado_cpf` | text | sim |  |  | identificação |  |
| `convidado_nascimento` | date | sim |  |  | identificação |  |
| `convidado_email` | text | sim |  |  | identificação |  |
| `convidado_telefone` | text | sim |  |  | identificação |  |
| `solicitante_id` | uuid | sim |  | → usuarios |  | Quem lançou. Igual ao beneficiário quando a pessoa pediu para si; a gestão lança por diretor sem conta e por convidado. |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  | Departamento que banca a viagem — dá a conta contábil (mesmo de-para das diárias). |
| `evento_id` | uuid | sim |  | → eventos (set null) |  |  |
| `evento_inscricao_id` | uuid | sim |  | → eventos_inscricoes (set null) |  |  |
| `motivo` | text | não |  |  | identificação | Motivo da viagem; texto livre. |
| `situacao` | text | não | `'solicitada'::text` |  |  |  |
| `motivo_situacao` | text | sim |  |  |  |  |
| `atendido_por` | uuid | sim |  | → usuarios |  |  |
| `atendido_em` | timestamp with time zone | sim |  |  |  |  |
| `encerrado_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `evento_externo` | text | sim |  |  |  | Nome do evento de fora (não cadastrado em Eventos). Excludente com evento_id. |

Checks: `viagens_solicitacoes_beneficiario_check` `CHECK ((((beneficiario_tipo = 'convidado'::text) AND (convidado_nome IS NOT NULL)) OR ((beneficiario_tipo <> 'convidado'::text) AND (beneficiario_usuario_id IS NOT NULL))))`; `viagens_solicitacoes_beneficiario_tipo_check` `CHECK ((beneficiario_tipo = ANY (ARRAY['funcionario'::text, 'diretor'::text, 'convidado'::text])))`; `viagens_solicitacoes_situacao_check` `CHECK ((situacao = ANY (ARRAY['solicitada'::text, 'em_atendimento'::text, 'atendida'::text, 'cancelada'::text, 'recusada'::text])))`

Índices: `idx_viagens_solic_beneficiario`, `idx_viagens_solic_emp_criacao`, `idx_viagens_solic_evento`, `idx_viagens_solic_situacao`, `idx_viagens_solic_solicitante`, `viagens_solicitacoes_pkey`
