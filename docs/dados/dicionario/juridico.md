<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Jurídico

5 tabelas. Diagrama: [er/juridico.md](../er/juridico.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [juridico_configuracoes](#juridico_configuracoes) | — | Configuração do jurídico, uma linha por tenant: centro de custo padrão das ordens de reembolso. |
| [juridico_homologacoes](#juridico_homologacoes) | identificação, trabalhista, **sensível: sindical** | Homologações de rescisão acompanhadas pelo Jurídico, de filiados ou não filiados: data, demissão, motivo e parecer. Espelho de Jurídico - Ho… |
| [juridico_processos](#juridico_processos) | identificação, **sensível: sindical** | Processos judiciais acompanhados pela assessoria jurídica da entidade: número, área, partes, escritório e responsável. Origem Bubble. |
| [juridico_processos_filiados](#juridico_processos_filiados) | **sensível: sindical** | Ligação N:N entre processo judicial e os filiados que ele assessora. |
| [juridico_reembolsos](#juridico_reembolsos) | financeiro | Reembolsos de despesas de processos jurídicos: valor, comprovante, avaliação e ordem de pagamento gerada. Origem Bubble. |

## juridico_configuracoes

Configuração do jurídico, uma linha por tenant: centro de custo padrão das ordens de reembolso.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `centro_custo_id` | uuid | sim |  | → centros_de_custo |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `juridico_configuracoes_bubble_id_key`, `juridico_configuracoes_pkey`, `uq_juridico_configuracoes_emp`

## juridico_homologacoes

Homologações de rescisão acompanhadas pelo Jurídico, de filiados ou não filiados: data, demissão, motivo e parecer. Espelho de Jurídico - Homologações do Bubble.

- **LGPD:** identificação, trabalhista, **sensível: sindical** · titulares: filiados e trabalhadores não filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `data` | date | sim |  |  |  |  |
| `data_demissao` | date | sim |  |  | trabalhista |  |
| `motivo` | text | sim |  |  | trabalhista |  |
| `parecer_url` | text | sim |  |  | trabalhista | URL do arquivo no Bubble CDN -- TODO: migrar para Supabase Storage |
| `trabalhador_nao_filiado` | text | sim |  |  | identificação | Legado Bubble: identificação textual do não filiado. |
| `filiado_id` | uuid | sim |  | → filiacoes | **sensível: sindical** |  |
| `fonte_pg_id` | uuid | sim |  | → empresa |  |  |
| `sindicato_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `trabalhador_nome` | text | sim |  |  | identificação | Nome do trabalhador quando NÃO-FILIADO (filiado_id nulo). Nos filiados o nome vem de filiacoes. Os 460 não-filiados migrados do Bubble ficam sem nome — o legado não gravou; só se preenche daqui pra frente. |
| `trabalhador_cpf` | text | sim |  |  | identificação | CPF (só dígitos) do trabalhador não-filiado. Idem: legado sem CPF. |
| `observacoes` | text | sim |  |  | trabalhista |  |
| `registrado_por_id` | uuid | sim |  | → usuarios |  | Usuário do painel que cadastrou a homologação. Nulo no legado. |

Únicas: `UNIQUE (bubble_id)`

Índices: `juridico_homologacoes_bubble_id_key`, `juridico_homologacoes_data_idx`, `juridico_homologacoes_filiado_idx`, `juridico_homologacoes_fonte_idx`, `juridico_homologacoes_motivo_idx`, `juridico_homologacoes_pkey`

## juridico_processos

Processos judiciais acompanhados pela assessoria jurídica da entidade: número, área, partes, escritório e responsável. Origem Bubble.

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `numero_processo` | text | sim |  |  | identificação |  |
| `coletivo` | boolean | sim | `false` |  |  |  |
| `finalizado` | boolean | sim | `false` |  |  |  |
| `parte_assessorada` | text | sim |  |  | identificação |  |
| `partes_assessoradas` | text[] | sim |  |  | identificação |  |
| `outras_partes` | text[] | sim |  |  | identificação |  |
| `status_processo` | text | sim |  |  |  |  |
| `assessoria_id` | uuid | sim |  | → empresa |  | Escritório de advocacia responsável pelo caso (linha de empresa/fornecedor). Favorecido dos reembolsos do processo. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `filiados_raw` | jsonb | sim |  |  | **sensível: sindical** | Lista de bubble_ids de Filiações -- TODO: normalizar (junção N:N) |
| `tipo` | text | sim |  |  |  | Área do direito (Trabalhista, Cível, Previdenciário, …). Lista controlada na aplicação. |
| `data_abertura` | date | sim |  |  |  | Data de distribuição/abertura. Opcional; a ordenação cai para created_at quando ausente. |
| `observacoes` | text | sim |  |  | identificação |  |
| `responsavel_id` | uuid | sim |  | → usuarios |  | Usuário do sindicato responsável pelo acompanhamento do processo. |
| `registrado_por_id` | uuid | sim |  | → usuarios |  | Usuário do painel que cadastrou o processo. |

Únicas: `UNIQUE (bubble_id)`

Índices: `juridico_processos_assessoria_idx`, `juridico_processos_bubble_id_key`, `juridico_processos_emp_idx`, `juridico_processos_pkey`, `juridico_processos_responsavel_idx`, `juridico_processos_status_idx`, `juridico_processos_tipo_idx`

## juridico_processos_filiados

Ligação N:N entre processo judicial e os filiados que ele assessora.

- **LGPD:** **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `processo_id` | uuid | não |  | → juridico_processos (**cascade**) |  |  |
| 🔑 `filiado_id` | uuid | não |  | → filiacoes (**cascade**) |  |  |

Índices: `juridico_processos_filiados_filiado_idx`, `juridico_processos_filiados_pkey`

## juridico_reembolsos

Reembolsos de despesas de processos jurídicos: valor, comprovante, avaliação e ordem de pagamento gerada. Origem Bubble.

- **LGPD:** financeiro · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `valor` | numeric(15,2) | sim |  |  | financeiro |  |
| `data_pagamento` | date | sim |  |  |  |  |
| `descricao_despesa` | text | sim |  |  | financeiro |  |
| `comprovante_despesa` | text | sim |  |  | financeiro | Caminho do comprovante no bucket privado `juridico`. Nunca URL pública — a URL assinada é gerada no servidor na hora da exibição. |
| `processo_id` | uuid | sim |  | → juridico_processos |  |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `situacao` | text | não | `'aguardando'::text` |  |  | aguardando \| aprovado \| reprovado. O estado 'pago' deriva da ordem de pagamento vinculada (ordem_pagamento_id.pago). |
| `data_despesa` | date | sim |  |  |  |  |
| `solicitante_id` | uuid | sim |  | → usuarios |  |  |
| `avaliador_id` | uuid | sim |  | → usuarios |  |  |
| `avaliacao_data` | timestamp with time zone | sim |  |  |  |  |
| `avaliacao_observacao` | text | sim |  |  |  | Justificativa do avaliador ao aprovar ou reprovar. |

Únicas: `UNIQUE (bubble_id)`

Índices: `juridico_reembolsos_bubble_id_key`, `juridico_reembolsos_ordem_idx`, `juridico_reembolsos_pkey`, `juridico_reembolsos_processo_idx`, `juridico_reembolsos_situacao_idx`
