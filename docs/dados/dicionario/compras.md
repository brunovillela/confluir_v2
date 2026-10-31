<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Compras, fornecedores e contratos

22 tabelas. Diagrama: [er/compras.md](../er/compras.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [compras_departamentos_acesso](#compras_departamentos_acesso) | identificação | Quais departamentos cada usuário enxerga em Compras (acesso às compras por departamento), definido por um gestor. |
| [compras_fornecimentos](#compras_fornecimentos) | identificação | Cada compra efetivada com um fornecedor dentro de um processo de compra: valor, forma de pagamento, nota fiscal, ordem de pagamento, recebim… |
| [compras_itens](#compras_itens) | — | Itens de solicitação de compra migrados do Bubble (descrição, quantidade, unidade). Sem uso encontrado no código (possível legado do Bubble)… |
| [compras_ordem_compra](#compras_ordem_compra) | — | Ordem de compra do modelo antigo do Bubble, com preços e quantidades por item em arrays. Sem uso encontrado no código (possível legado do Bu… |
| [compras_pedido](#compras_pedido) | identificação | Pedido de compra do modelo antigo do Bubble (frete, preço, autorizador). Sem uso encontrado no código (possível legado do Bubble), vazia. |
| [compras_propostas](#compras_propostas) | identificação | Propostas (cotações) de fornecedores num processo de compra, com valor, prazo e arquivo; a escolhida vira fornecimento. Boa parte migrada do… |
| [compras_rpa](#compras_rpa) | financeiro, identificação | Recibo de Pagamento a Autônomo emitido a fornecedor pessoa física por contrato ou compra de serviço, com cálculo de INSS, IRRF e ISS, ordem … |
| [compras_rpa_config](#compras_rpa_config) | — | Parâmetros fiscais por tenant para o cálculo do RPA: alíquota e teto do INSS, faixas do IRRF, dedução por dependente e ISS padrão. |
| [compras_solicitacao](#compras_solicitacao) | — | Solicitação de compra do modelo antigo do Bubble, com até cinco itens em colunas numeradas. Sem uso encontrado no código (possível legado do… |
| [compras_solicitacoes](#compras_solicitacoes) | identificação | Processo de compra: da solicitação (ou aquisição direta) à cotação, avaliação, compra, pagamento e recebimento. Maioria migrada do Bubble; c… |
| [contratos](#contratos) | identificação, financeiro | Contratos da entidade com fornecedores (PJ ou PF): objeto, vigência, valor, aditivos, autorização e arquivo. Migrados do Bubble e mantidos e… |
| [contratos_categorias](#contratos_categorias) | — | Categorias de contrato por tenant; categoria sigilosa restringe quem vê os contratos dela. |
| [contratos_clausulas_fixas](#contratos_clausulas_fixas) | — | Cláusulas padrão que a entidade quer em toda minuta gerada pela IA, opcionalmente só para alguns tipos de minuta. |
| [contratos_minuta_tipos](#contratos_minuta_tipos) | — | Tipos de minuta de contrato oferecidos no assistente de minutas, com a orientação passada à IA para cada tipo. |
| [contratos_minutas](#contratos_minutas) | identificação, financeiro | Minutas de contrato redigidas com a IA e revisadas pela entidade. parametros = dados informados; texto = versão atual. |
| [contratos_minutas_versoes](#contratos_minutas_versoes) | identificação | Histórico de versões do texto de uma minuta de contrato, com a origem (IA ou edição manual) e o pedido feito à IA. |
| [documento_assinatura_eventos](#documento_assinatura_eventos) | identificação | Trilha de auditoria da assinatura (enviado, reenviado, visualizado, codigo_enviado, codigo_invalido, assinado, recusado, cancelado). Só inse… |
| [documento_assinaturas](#documento_assinaturas) | identificação, trabalhista, **credencial (nunca exportar)** | Envelope de assinatura eletrônica de um documento (ofício, termo de cessão), por assinante: token do link, código por e-mail, hash do conteú… |
| [fa_documentos](#fa_documentos) | — | Documentos institucionais da entidade (estatuto, regimentos, normas), migrados do FA Documentos do Bubble; os arquivos ficam nas versões. Us… |
| [fa_documentos_categorias](#fa_documentos_categorias) | — | Categorias dos documentos institucionais, migradas do Bubble. |
| [fa_documentos_categorias_junction](#fa_documentos_categorias_junction) | — | Ligação muitos-para-muitos entre documentos institucionais e categorias. |
| [fa_documentos_versao](#fa_documentos_versao) | — | Versões (arquivos) dos documentos institucionais com vigência. O vínculo real com o documento é documento_raw (bubble_id), pois documento_id… |

## compras_departamentos_acesso

Quais departamentos cada usuário enxerga em Compras (acesso às compras por departamento), definido por um gestor.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `usuario_id` | uuid | sim |  | → usuarios (**cascade**) | identificação |  |
| `departamento_id` | uuid | sim |  | → empresa_departamentos (**cascade**) |  |  |
| `definido_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `compras_departamentos_acesso_pkey`, `idx_compras_deptos_acesso_emp`, `ux_compras_deptos_acesso`

## compras_fornecimentos

Cada compra efetivada com um fornecedor dentro de um processo de compra: valor, forma de pagamento, nota fiscal, ordem de pagamento, recebimento e envio da ordem de compra por e-mail.

- **LGPD:** identificação · titulares: fornecedores PF, usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `processo_id` | uuid | não |  | → compras_solicitacoes |  |  |
| `proposta_id` | uuid | sim |  | → compras_propostas |  |  |
| `fornecedor_id` | uuid | não |  | → empresa |  |  |
| `valor` | numeric | não |  |  |  |  |
| `forma_pagamento` | text | sim |  |  |  |  |
| `previsao_entrega` | date | sim |  |  |  |  |
| `comprador_id` | uuid | sim |  | → usuarios | identificação |  |
| `data_compra` | date | sim |  |  |  |  |
| `nota_fiscal_url` | text | sim |  |  |  |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `recebido` | boolean | não | `false` |  |  |  |
| `recebimento_data` | date | sim |  |  |  |  |
| `recebimento_recebido_por_id` | uuid | sim |  | → usuarios | identificação |  |
| `recebimento_de_acordo` | boolean | sim |  |  |  |  |
| `recebimento_observacao` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `oc_enviada_em` | timestamp with time zone | sim |  |  |  | Último envio da ordem de compra (PDF) ao fornecedor por e-mail. |
| `oc_enviada_para` | text | sim |  |  | identificação | E-mails dos contatos do fornecedor que receberam a ordem de compra. |
| `oc_enviada_por_id` | uuid | sim |  | → usuarios |  |  |
| `nota_a_receber` | boolean | não | `false` |  |  | Compra em marketplace cuja nota fiscal ainda não chegou. |
| `nota_aviso_em` | timestamp with time zone | sim |  |  |  | Último aviso por e-mail cobrando a nota a receber. |
| `vendedor_id` | uuid | sim |  | → empresa (set null) |  | Vendedor do marketplace (loja) quando difere do fornecedor. |

Checks: `compras_fornecimentos_valor_check` `CHECK ((valor >= (0)::numeric))`

Índices: `compras_fornecimentos_nota_a_receber_idx`, `compras_fornecimentos_pkey`, `compras_fornecimentos_vendedor_idx`, `idx_compras_fornecimentos_pendentes`, `idx_compras_fornecimentos_processo`

## compras_itens

Itens de solicitação de compra migrados do Bubble (descrição, quantidade, unidade). Sem uso encontrado no código (possível legado do Bubble), vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `descricao_item` | text | sim |  |  |  |  |
| `quantidade` | integer | sim |  |  |  |  |
| `unidade_medida` | text | sim |  |  |  |  |
| `caracteristicas` | text | sim |  |  |  |  |
| `link_referencia` | text | sim |  |  |  |  |
| `processo_compras_id` | uuid | sim |  | → compras_solicitacao |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `compras_itens_bubble_id_key`, `compras_itens_pkey`

## compras_ordem_compra

Ordem de compra do modelo antigo do Bubble, com preços e quantidades por item em arrays. Sem uso encontrado no código (possível legado do Bubble), vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `aprovacao` | boolean | sim | `false` |  |  |  |
| `custo_entrega` | numeric(15,2) | sim |  |  |  |  |
| `tempo_entrega` | integer | sim |  |  |  |  |
| `precos_unitarios` | numeric[] | sim |  |  |  |  |
| `precos_totais` | numeric[] | sim |  |  |  |  |
| `quantidades_fornecidas` | integer[] | sim |  |  |  |  |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `solicitacao_id` | uuid | sim |  | → compras_solicitacao |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `compras_ordem_compra_bubble_id_key`, `compras_ordem_compra_pkey`

## compras_pedido

Pedido de compra do modelo antigo do Bubble (frete, preço, autorizador). Sem uso encontrado no código (possível legado do Bubble), vazia.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `frete` | numeric(15,2) | sim |  |  |  |  |
| `quantidade` | integer | sim |  |  |  |  |
| `preco_unitario` | numeric(15,2) | sim |  |  |  |  |
| `ha_autorizacao` | boolean | sim | `false` |  |  |  |
| `entrega_tempo_dias` | integer | sim |  |  |  |  |
| `observacao_comprador` | text | sim |  |  |  |  |
| `lista_fornecedores` | text[] | sim |  |  |  | ids Bubble dos fornecedores consultados. |
| `autorizador` | text | sim |  |  | identificação | Nome ou id Bubble de quem autorizou. |
| `solicitacao_id` | uuid | sim |  | → compras_solicitacao |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `compras_pedido_bubble_id_key`, `compras_pedido_pkey`

## compras_propostas

Propostas (cotações) de fornecedores num processo de compra, com valor, prazo e arquivo; a escolhida vira fornecimento. Boa parte migrada do Bubble.

- **LGPD:** identificação · titulares: fornecedores PF, usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `forma_pagamento` | text | sim |  |  |  |  |
| `previsao_entrega` | date | sim |  |  |  |  |
| `proposta_arquivo_url` | text | sim |  |  | identificação | Arquivo da proposta; de fornecedor PF pode conter nome, CPF e contato. |
| `valor_proposta` | numeric | sim |  |  |  |  |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `processo_compra_id` | uuid | sim |  | → compras_solicitacoes |  |  |
| `escolhida` | boolean | não | `false` |  |  |  |
| `escolhida_em` | timestamp with time zone | sim |  |  |  |  |
| `escolhida_por_id` | uuid | sim |  | → usuarios | identificação |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `compras_propostas_bubble_id_key`, `compras_propostas_pkey`, `idx_compras_propostas_processo`

## compras_rpa

Recibo de Pagamento a Autônomo emitido a fornecedor pessoa física por contrato ou compra de serviço, com cálculo de INSS, IRRF e ISS, ordem do líquido e assinatura do prestador por link ou anexo.

- **LGPD:** financeiro, identificação · titulares: fornecedores PF (autônomos)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `numero` | integer | sim |  |  |  |  |
| `fornecedor_id` | uuid | sim |  | → empresa | identificação | Autônomo pessoa física que prestou o serviço. |
| `descricao_servico` | text | sim |  |  |  |  |
| `data_servico` | date | sim |  |  |  |  |
| `base` | text | sim |  |  |  | Se o valor informado é bruto ou líquido. |
| `valor_informado` | numeric | sim |  |  | financeiro |  |
| `valor_bruto` | numeric | sim |  |  | financeiro |  |
| `inss` | numeric | sim |  |  | financeiro | INSS retido do autônomo. |
| `irrf` | numeric | sim |  |  | financeiro | IRRF retido do autônomo. |
| `iss` | numeric | sim |  |  | financeiro |  |
| `iss_aliquota` | numeric | sim |  |  |  |  |
| `dependentes` | integer | não | `0` |  | identificação | Número de dependentes do autônomo para dedução do IRRF. |
| `valor_liquido` | numeric | sim |  |  | financeiro |  |
| `observacoes` | text | sim |  |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `contrato_id` | uuid | sim |  | → contratos (restrict) |  | Contrato a que o RPA pertence. Nulo = RPA de compra de serviço (processo_compra_id) ou anterior a 29/09/2026. |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento (set null) |  | Ordem de pagamento gerada na emissão (valor líquido, tipo "RPA"). |
| `arquivo_assinado` | text | sim |  |  | identificação | Caminho (bucket compras) do recibo assinado pelo prestador. Com ele, o RPA não pode mais ser excluído. |
| `assinado_em` | timestamp with time zone | sim |  |  |  | Quando o recibo assinado foi anexado. |
| `assinado_por_id` | uuid | sim |  | → usuarios |  |  |
| `processo_compra_id` | uuid | sim |  | → compras_solicitacoes (set null) |  | Compra de serviço que originou o RPA (desde 02/10/2026). Nulo = RPA de contrato. |
| `fornecimento_id` | uuid | sim |  | → compras_fornecimentos (set null) |  | Fornecimento da compra pago por este RPA — a ordem do líquido é a ordem dele. |
| `assinatura_hash` | text | sim |  |  |  | SHA-256 do recibo enviado para assinatura eletrônica. |
| `assinatura_enviada_em` | timestamp with time zone | sim |  |  |  |  |
| `assinatura_origem` | text | sim |  |  |  | eletronica = assinado pelo link do e-mail; anexo = recibo assinado à mão ou pelo gov.br, anexado no painel (cancela o link). |
| `assinatura_validacao` | jsonb | sim |  |  | identificação | Resultado da validação das assinaturas digitais do PDF anexado: assinantes, CPF esperado e se confere. |
| `irrf_mes` | date | sim |  |  |  | Primeiro dia do mês do pagamento em que o IRRF e o teto do INSS deste RPA foram apurados. Nulo nos RPAs anteriores a 31/10/2026 e nos avulsos, emitidos sem data de pagamento. |
| `irrf_memoria` | jsonb | sim |  |  | financeiro | Memória do cálculo do mês, quando havia outros RPAs do prestador no mesmo mês do pagamento: os anteriores (número, bruto, INSS, IRRF), o bruto, o INSS, a base e o IRRF do mês e o já retido. Nulo quando o RPA foi o único do mês. |

Checks: `ck_compras_rpa_assinatura_origem` `CHECK (((assinatura_origem IS NULL) OR (assinatura_origem = ANY (ARRAY['eletronica'::text, 'anexo'::text])))) NOT VALID`

Índices: `compras_rpa_fornecimento_idx`, `compras_rpa_pkey`, `idx_compras_rpa_contrato`, `idx_compras_rpa_fornecedor`, `idx_compras_rpa_ordem`, `ux_compras_rpa_numero`

## compras_rpa_config

Parâmetros fiscais por tenant para o cálculo do RPA: alíquota e teto do INSS, faixas do IRRF, dedução por dependente e ISS padrão.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `inss_aliquota` | numeric | sim |  |  |  |  |
| `inss_teto` | numeric | sim |  |  |  |  |
| `irrf_faixas` | jsonb | sim |  |  |  |  |
| `irrf_deducao_dependente` | numeric | sim |  |  |  |  |
| `iss_aliquota_padrao` | numeric | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `inss_patronal_aliquota` | numeric(5,2) | não | `20` |  |  | Cota patronal do INSS sobre o bruto do RPA (20%), devida pela entidade e somada na guia do INSS. |
| `limite_rpas_mes` | integer | sim | `1` |  |  | A partir de quantos RPAs do mesmo prestador no mesmo mês (de emissão ou de pagamento) o sistema avisa. Só aviso desde 31/10/2026: o IRRF já é apurado pelo total do mês. Nulo = sem aviso; padrão 1. |

Checks: `compras_rpa_config_limite_rpas_mes_check` `CHECK (((limite_rpas_mes IS NULL) OR (limite_rpas_mes >= 1)))`

Índices: `compras_rpa_config_pkey`, `ux_compras_rpa_config_emp`

## compras_solicitacao

Solicitação de compra do modelo antigo do Bubble, com até cinco itens em colunas numeradas. Sem uso encontrado no código (possível legado do Bubble), vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `situacao` | text | sim |  |  |  |  |
| `data_limite` | date | sim |  |  |  |  |
| `tem_data_limite` | boolean | sim | `false` |  |  |  |
| `departamento` | text | sim |  |  |  |  |
| `justificativa` | text | sim |  |  |  |  |
| `medida1` | text | sim |  |  |  |  |
| `medida2` | text | sim |  |  |  |  |
| `medida3` | text | sim |  |  |  |  |
| `medida4` | text | sim |  |  |  |  |
| `medida5` | text | sim |  |  |  |  |
| `pedido1` | text | sim |  |  |  |  |
| `pedido2` | text | sim |  |  |  |  |
| `pedido3` | text | sim |  |  |  |  |
| `descricao1` | text | sim |  |  |  |  |
| `descricao2` | text | sim |  |  |  |  |
| `descricao3` | text | sim |  |  |  |  |
| `descricao4` | text | sim |  |  |  |  |
| `descricao5` | text | sim |  |  |  |  |
| `especificacao1` | text | sim |  |  |  |  |
| `especificacao2` | text | sim |  |  |  |  |
| `especificacao3` | text | sim |  |  |  |  |
| `especificacao4` | text | sim |  |  |  |  |
| `especificacao5` | text | sim |  |  |  |  |
| `quantidade1` | integer | sim |  |  |  |  |
| `quantidade2` | integer | sim |  |  |  |  |
| `quantidade3` | integer | sim |  |  |  |  |
| `quantidade4` | integer | sim |  |  |  |  |
| `quantidade5` | integer | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `compras_solicitacao_bubble_id_key`, `compras_solicitacao_pkey`

## compras_solicitacoes

Processo de compra: da solicitação (ou aquisição direta) à cotação, avaliação, compra, pagamento e recebimento. Maioria migrada do Bubble; colunas _raw guardam listas do Bubble ainda não normalizadas.

- **LGPD:** identificação · titulares: usuários do sistema, fornecedores PF
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `cancelado` | boolean | sim |  |  |  |  |
| `cancelado_quando` | date | sim |  |  |  |  |
| `cancelado_por_id` | uuid | sim |  | → usuarios |  |  |
| `codigo` | text | sim |  |  |  |  |
| `solicitacao_centro_custo_id` | uuid | sim |  | → centros_de_custo |  |  |
| `solicitacao_departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `solicitacao_observacao` | text | sim |  |  | identificação |  |
| `solicitacao_produto` | text | sim |  |  |  |  |
| `solicitacao_e_produto` | boolean | sim |  |  |  |  |
| `solicitacao_e_via_contrato` | boolean | sim |  |  |  | Compra feita no âmbito de um contrato existente. |
| `solicitacao_data_limite` | date | sim |  |  |  |  |
| `solicitacao_local` | text | sim |  |  |  | Local de entrega ou uso do item. |
| `solicitacao_projeto_id` | uuid | sim |  | → projeto |  |  |
| `descricao_objetivo` | text | sim |  |  |  |  |
| `justificativa` | text | sim |  |  |  |  |
| `link_referencia` | text | sim |  |  |  |  |
| `quantidade` | numeric | sim |  |  |  |  |
| `em_cotacao` | boolean | sim |  |  |  |  |
| `estocavel` | boolean | sim |  |  |  | Item vai para o estoque. |
| `estoque_id` | uuid | sim |  | → estoque |  |  |
| `proposta_comercial_url` | text | sim |  |  |  |  |
| `recebedor_id` | uuid | sim |  | → usuarios | identificação |  |
| `recebido` | boolean | sim |  |  |  |  |
| `cotacao_inicio` | date | sim |  |  |  |  |
| `cotacao_responsavel_id` | uuid | sim |  | → usuarios | identificação |  |
| `cotacao_termino` | date | sim |  |  |  |  |
| `cotacao_proposta_id` | uuid | sim |  | → compras_propostas |  |  |
| `cotacao_propostas_raw` | jsonb | sim |  |  |  | ids Bubble das propostas, legado. |
| `aprovacao_id` | uuid | sim |  |  |  |  |
| `avaliacao_aprovada` | boolean | sim |  |  |  |  |
| `avaliacao_avaliador_id` | uuid | sim |  | → usuarios | identificação |  |
| `avaliacao_data` | date | sim |  |  |  |  |
| `avaliacao_observacao` | text | sim |  |  | identificação |  |
| `comprado` | boolean | sim |  |  |  |  |
| `comprado_por_id` | uuid | sim |  | → usuarios | identificação |  |
| `comprovante_url` | text | sim |  |  |  |  |
| `compra_data` | date | sim |  |  |  |  |
| `compra_fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `compra_valor` | numeric | sim |  |  |  |  |
| `pagamento_data` | date | sim |  |  |  |  |
| `pagamento_enviado_por_id` | uuid | sim |  | → usuarios |  |  |
| `pagamento_ordens_raw` | jsonb | sim |  |  |  | ids Bubble das ordens de pagamento, legado. |
| `comprovantes_fiscais_raw` | jsonb | sim |  |  |  | Comprovantes fiscais do Bubble, legado. |
| `recebimento_data` | date | sim |  |  |  |  |
| `recebimento_de_acordo` | boolean | sim |  |  |  |  |
| `recebimento_observacao` | text | sim |  |  | identificação |  |
| `recebimento_recebido_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `aquisicao_direta` | boolean | sim |  |  |  | Compra registrada sem passar por solicitação e cotação. |
| `solicitante_id` | uuid | sim |  | → usuarios | identificação | Quem registrou a compra (solicitação ou aquisição direta). Vê a compra mesmo fora dos seus departamentos. |
| `solicitacao_entrega_no_ato` | boolean | não | `false` |  |  | Item entregue no momento da compra. |

Únicas: `UNIQUE (bubble_id)`

Índices: `compras_solicitacoes_bubble_id_key`, `compras_solicitacoes_pkey`, `idx_compras_solicitacoes_codigo`, `idx_compras_solicitacoes_criacao`

## contratos

Contratos da entidade com fornecedores (PJ ou PF): objeto, vigência, valor, aditivos, autorização e arquivo. Migrados do Bubble e mantidos em Compras, Contratos.

- **LGPD:** identificação, financeiro · titulares: fornecedores PF, usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`, `trg_contratos_updated_at` → `set_updated_at`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `vigencia_inicio` | date | sim |  |  |  |  |
| `vigencia_termino` | date | sim |  |  |  |  |
| `objeto` | text | sim |  |  |  |  |
| `ativo` | boolean | sim | `true` |  |  |  |
| `deletado` | boolean | sim | `false` |  |  |  |
| `aditivo` | boolean | sim | `false` |  |  | Registro é aditivo de contrato_principal_id. |
| `sob_demanda` | boolean | sim | `false` |  |  | Contrato sem valor fixo, pago conforme uso. |
| `responsavel_id` | uuid | sim |  | → usuarios | identificação |  |
| `fornecedor_id` | uuid | sim |  | → empresa |  | Contratado; quando pessoa física, o contrato é dado pessoal financeiro. |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `apoio_institucional` | boolean | sim | `false` |  |  | Contrato de apoio institucional (patrocínio), não de fornecimento. |
| `arquivo_contrato` | text | sim |  |  | identificação | PDF do contrato, com qualificação das partes. |
| `autorizacao_autorizador_id` | uuid | sim |  | → usuarios |  |  |
| `autorizacao_data` | date | sim |  |  |  |  |
| `autorizacao_esta_autorizado` | boolean | sim | `false` |  |  |  |
| `centro_custo_id` | uuid | sim |  | → centros_de_custo |  |  |
| `codigo` | text | sim |  |  |  |  |
| `contrato_principal_id` | uuid | sim |  | → contratos |  |  |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `slug` | text | sim |  |  |  |  |
| `valor` | numeric(15,2) | sim |  |  | financeiro | Valor do contrato; pessoal quando o contratado é PF. |
| `categoria_id` | uuid | sim |  | → contratos_categorias |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `contratos_bubble_id_key`, `contratos_pkey`, `idx_bub_contratos`, `idx_contratos_categoria`, `idx_contratos_departamento`, `idx_contratos_emp_proprietaria`, `idx_contratos_fornecedor`, `idx_contratos_principal`, `idx_contratos_vigencia_termino`

## contratos_categorias

Categorias de contrato por tenant; categoria sigilosa restringe quem vê os contratos dela.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `sigiloso` | boolean | sim | `false` |  |  | Contratos da categoria só aparecem para quem tem permissão especial. |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `contratos_categorias_bubble_id_key`, `contratos_categorias_pkey`

## contratos_clausulas_fixas

Cláusulas padrão que a entidade quer em toda minuta gerada pela IA, opcionalmente só para alguns tipos de minuta.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `titulo` | text | não | `''::text` |  |  |  |
| `texto` | text | não | `''::text` |  |  |  |
| `ativa` | boolean | não | `true` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `tipos` | uuid[] | não | `'{}'::uuid[]` |  |  | Tipos de minuta em que a cláusula entra; vazio = todos. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `contratos_clausulas_fixas_pkey`, `idx_contratos_clausulas_fixas_emp`

## contratos_minuta_tipos

Tipos de minuta de contrato oferecidos no assistente de minutas, com a orientação passada à IA para cada tipo.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | não | `''::text` |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `orientacao` | text | sim |  |  |  | Instruções de redação enviadas à IA para este tipo. |
| `ativo` | boolean | não | `true` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `contratos_minuta_tipos_pkey`, `idx_contratos_minuta_tipos_emp`

## contratos_minutas

Minutas de contrato redigidas com a IA e revisadas pela entidade. parametros = dados informados; texto = versão atual.

- **LGPD:** identificação, financeiro · titulares: fornecedores PF, autônomos contratados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `contrato_id` | uuid | sim |  | → contratos (set null) |  |  |
| `titulo` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `parametros` | jsonb | não | `'{}'::jsonb` |  | identificação | Dados informados para a redação: partes (nome, CPF, endereço), valores e condições. |
| `texto` | text | sim |  |  | identificação | Texto da minuta com a qualificação das partes. |
| `versao` | integer | não | `0` |  |  |  |
| `finalizada` | boolean | não | `false` |  |  |  |
| `deletado` | boolean | não | `false` |  |  |  |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `atualizado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `tipo_id` | uuid | sim |  | → contratos_minuta_tipos (set null) |  |  |
| `assinatura_hash` | text | sim |  |  |  | SHA-256 do texto enviado para assinatura. Enquanto houver envio ativo ou assinatura, o texto não pode mudar. |
| `assinatura_enviada_em` | timestamp with time zone | sim |  |  |  |  |
| `assinada_em` | timestamp with time zone | sim |  |  |  |  |
| `arquivo_assinado` | text | sim |  |  | identificação |  |
| `arquivo_assinado_em` | timestamp with time zone | sim |  |  |  |  |
| `arquivo_assinado_por_id` | uuid | sim |  | → usuarios |  |  |
| `assinatura_validacao` | jsonb | sim |  |  | identificação | Validação das assinaturas digitais do PDF: assinantes e CPF conferido. |

Índices: `contratos_minutas_pkey`, `idx_contratos_minutas_contrato`, `idx_contratos_minutas_emp`

## contratos_minutas_versoes

Histórico de versões do texto de uma minuta de contrato, com a origem (IA ou edição manual) e o pedido feito à IA.

- **LGPD:** identificação · titulares: fornecedores PF, autônomos contratados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `minuta_id` | uuid | sim |  | → contratos_minutas (**cascade**) |  |  |
| `versao` | integer | não |  |  |  |  |
| `texto` | text | não |  |  | identificação |  |
| `origem` | text | não | `'ia'::text` |  |  | Como a versão nasceu: ia ou manual. |
| `pedido` | text | sim |  |  |  | Instrução de ajuste dada à IA. |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `contratos_minutas_versoes_origem_check` `CHECK ((origem = ANY (ARRAY['ia'::text, 'ajuste'::text, 'edicao'::text, 'restauracao'::text])))`

Índices: `contratos_minutas_versoes_pkey`, `idx_contratos_minutas_versoes`

## documento_assinatura_eventos

Trilha de auditoria da assinatura (enviado, reenviado, visualizado, codigo_enviado, codigo_invalido, assinado, recusado, cancelado). Só inserção.

- **LGPD:** identificação · titulares: diretores, funcionários, público externo (assinantes)
- **RLS:** ligado · policies: `trilha_insercao`, `trilha_leitura`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `assinatura_id` | uuid | sim |  | → documento_assinaturas (**cascade**) |  |  |
| `tipo` | text | não |  |  |  |  |
| `detalhe` | text | sim |  |  | identificação |  |
| `ip` | text | sim |  |  | identificação |  |
| `user_agent` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_oficios_assinaturas_eventos`, `oficios_assinaturas_eventos_pkey`

## documento_assinaturas

Envelope de assinatura eletrônica de um documento (ofício, termo de cessão), por assinante: token do link, código por e-mail, hash do conteúdo e certificado. Nome antigo: oficios_assinaturas.

- **LGPD:** identificação, trabalhista, **credencial (nunca exportar)** · titulares: diretores, funcionários, público externo (cessionários e signatários)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `oficio_id` | uuid | sim |  | → oficios (**cascade**) |  |  |
| `integrante_id` | uuid | sim |  | → diretoria_integrantes (set null) |  |  |
| `nome` | text | sim |  |  | identificação |  |
| `cargo` | text | sim |  |  | trabalhista |  |
| `email` | text | sim |  |  | identificação |  |
| `token` | uuid | não | `gen_random_uuid()` |  | **credencial (nunca exportar)** | Token do link pessoal de assinatura. |
| `certificado` | text | sim |  |  | identificação | Certificado de assinatura com nome, data, IP e hash. |
| `situacao` | text | não | `'pendente'::text` |  |  |  |
| `hash_documento` | text | sim |  |  |  |  |
| `codigo_hash` | text | sim |  |  | **credencial (nunca exportar)** | Hash do código de uso único enviado ao assinante. |
| `codigo_expira_em` | timestamp with time zone | sim |  |  |  |  |
| `codigo_tentativas` | integer | não | `0` |  |  |  |
| `enviado_em` | timestamp with time zone | sim |  |  |  |  |
| `visualizado_em` | timestamp with time zone | sim |  |  |  |  |
| `assinado_em` | timestamp with time zone | sim |  |  |  |  |
| `recusado_em` | timestamp with time zone | sim |  |  |  |  |
| `motivo_recusa` | text | sim |  |  | identificação |  |
| `ip` | text | sim |  |  | identificação |  |
| `user_agent` | text | sim |  |  | identificação |  |
| `enviado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `canal` | text | não | `'email'::text` |  |  | Por onde o convite e o código de uso único foram entregues: email ou telegram. |
| `telegram_chat_id` | text | sim |  |  | identificação |  |
| `telegram_telefone` | text | sim |  |  | identificação |  |
| `documento_tipo` | text | sim |  |  |  | oficio \| cessao \| minuta \| rpa \| ferias — define de onde sai o conteúdo assinado (documento_id) e o que acontece ao assinar. ferias: documento_id = pessoal_ferias_gozo.id (aviso de férias assinado pelo funcionário). |
| `documento_id` | uuid | sim |  |  |  |  |
| `ordem` | smallint | não | `1` |  |  | Ordem de assinatura. A cessão tem dois assinantes: cedente (1) e concessionário (2). |
| `papel` | text | sim |  |  |  | Papel do assinante no documento (ex.: cedente, concessionário, signatário). |
| `cpf` | text | sim |  |  | identificação | CPF do assinante (só dígitos), informado no envio. Na assinatura da minuta a pessoa digita o CPF e ele precisa bater. |
| `nome_declarado` | text | sim |  |  | identificação | Nome digitado pelo assinante ao assinar. |
| `cpf_conferido_em` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_doc_assinaturas_papel` `CHECK (((papel IS NULL) OR (papel = ANY (ARRAY['cedente'::text, 'concessionario'::text, 'assinante'::text, 'contratante'::text, 'contratada'::text, 'testemunha'::text, 'prestador'::text])))) NOT VALID`; `ck_doc_assinaturas_tipo` `CHECK (((documento_tipo IS NULL) OR (documento_tipo = ANY (ARRAY['oficio'::text, 'cessao'::text, 'minuta'::text, 'rpa'::text, 'ferias'::text])))) NOT VALID`; `oficios_assinaturas_canal_check` `CHECK ((canal = ANY (ARRAY['email'::text, 'telegram'::text])))`; `oficios_assinaturas_situacao_check` `CHECK ((situacao = ANY (ARRAY['pendente'::text, 'assinado'::text, 'recusado'::text, 'cancelado'::text])))`

Índices: `idx_doc_assinaturas_documento`, `idx_oficios_assinaturas_oficio`, `oficios_assinaturas_pkey`, `ux_oficios_assinaturas_certificado`, `ux_oficios_assinaturas_token`

## fa_documentos

Documentos institucionais da entidade (estatuto, regimentos, normas), migrados do FA Documentos do Bubble; os arquivos ficam nas versões. Usado na tela de documentos institucionais.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `documento` | text | sim |  |  |  | Nome do documento. |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` |  |  |  |
| `created_at` | timestamp with time zone | sim |  |  |  |  |
| `modified_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `fa_documentos_bubble_id_key`, `fa_documentos_pkey`

## fa_documentos_categorias

Categorias dos documentos institucionais, migradas do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` |  |  |  |
| `created_at` | timestamp with time zone | sim |  |  |  |  |
| `modified_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `fa_documentos_categorias_bubble_id_key`, `fa_documentos_categorias_pkey`

## fa_documentos_categorias_junction

Ligação muitos-para-muitos entre documentos institucionais e categorias.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `documento_id` | uuid | não |  | → fa_documentos (**cascade**) |  |  |
| 🔑 `categoria_id` | uuid | não |  | → fa_documentos_categorias (**cascade**) |  |  |

Índices: `fa_documentos_categorias_junction_pkey`

## fa_documentos_versao

Versões (arquivos) dos documentos institucionais com vigência. O vínculo real com o documento é documento_raw (bubble_id), pois documento_id tem FK errada da migração e está nula.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `arquivo_url` | text | sim |  |  |  | Caminho no bucket documentos ou URL externa legada. |
| `vigencia_inicio` | date | sim |  |  |  |  |
| `vigencia_termino` | date | sim |  |  |  |  |
| `sem_vigencia` | boolean | sim | `false` |  |  |  |
| `documento_id` | uuid | sim |  | → pessoal_treinamentos |  | FK errada para pessoal_treinamentos, sempre nula; não usar. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `documento_raw` | text | sim |  |  |  | bubble_id do documento em fa_documentos; é o vínculo real. |
| `modified_at` | timestamp with time zone | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `fa_documentos_versao_bubble_id_key`, `fa_documentos_versao_pkey`
