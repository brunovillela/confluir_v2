<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Hospedagem

18 tabelas. Diagrama: [er/hospedagem.md](../er/hospedagem.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [fil_reemb_hospedagem](#fil_reemb_hospedagem) | **sensível: sindical** | Reembolso de hospedagem a filiado, espelho do Bubble (código, embarque, cancelado). Sem uso encontrado no código além da auditoria Bubble (p… |
| [hospedagem_acomodacoes](#hospedagem_acomodacoes) | — | Quartos do hotel conveniado com a quantidade de hóspedes, espelho do Bubble. Sem uso encontrado no código (possível legado do Bubble); tabel… |
| [hospedagem_alocacoes](#hospedagem_alocacoes) | identificação | Distribuição dos cupons nos quartos por noite nos hotéis de demanda garantida (quem dorme em qual quarto dedicado). Gravada pelo motor de al… |
| [hospedagem_avaliacoes](#hospedagem_avaliacoes) | **sensível: sindical**, identificação, **credencial (nunca exportar)** | Avaliação da estadia pelo filiado após o checkout (nota, etiquetas, comentário), por link com token; a gestão trata e pode ocultar do hotel. |
| [hospedagem_beneficiarios](#hospedagem_beneficiarios) | identificação | Lista de CPFs autorizados a usar a hospedagem quando a condição somente_beneficiarios está ligada (ex.: não filiados admitidos pela gestão). |
| [hospedagem_coletiva](#hospedagem_coletiva) | — | Hospedagem coletiva por data de checkin e acomodação, espelho do Bubble. Sem uso encontrado no código (possível legado do Bubble); tabela va… |
| [hospedagem_condicoes](#hospedagem_condicoes) | — | Condições de uso da hospedagem por entidade (uma linha): restrição por fonte e regime, limite de cupons por período, só beneficiários e puni… |
| [hospedagem_cupom](#hospedagem_cupom) | **sensível: sindical**, identificação, financeiro, **credencial (nunca exportar)** | Cupom de hospedagem: reserva de um filiado em hotel conveniado (datas, tarifa, presença, cancelamento, não comparecimento). Migrado do Bubbl… |
| [hospedagem_espera](#hospedagem_espera) | **sensível: sindical**, identificação, **credencial (nunca exportar)** | Fila de espera por vaga em hotel de demanda garantida; quando abre vaga a oferta é enviada por link com prazo. |
| [hospedagem_fatura](#hospedagem_fatura) | — | Fatura do hotel conveniado (código, nota fiscal) que agrupa serviços de hospedagem e vira ordem de pagamento. Migrada do Bubble e lida pela … |
| [hospedagem_hotel](#hospedagem_hotel) | — | Hotel conveniado: regras do convênio (modalidade normal ou demanda garantida, quartos dedicados, travas, prazos de cancelamento e espera) e … |
| [hospedagem_hotel_contas](#hospedagem_hotel_contas) | financeiro, identificação | Contas bancárias e chaves Pix do hotel para receber pagamentos, cadastradas pela interface do hotel. |
| [hospedagem_hotel_usuarios](#hospedagem_hotel_usuarios) | identificação | Usuários do hotel com acesso à interface /hotel (login próprio) e permissões por área. |
| [hospedagem_penalidade_liberacoes](#hospedagem_penalidade_liberacoes) | identificação | Liberação manual, pela gestão, de um CPF punido por não comparecimento, com motivo. |
| [hospedagem_quartos_noite](#hospedagem_quartos_noite) | — | Anotação do número real do quarto do hotel para cada quarto dedicado e noite, feita na interface do hotel (demanda garantida). |
| [hospedagem_reembolso](#hospedagem_reembolso) | — | Reembolso de hospedagem com código e programação SITAER ligado a ordem de pagamento, espelho do Bubble. Sem uso encontrado no código (possív… |
| [hospedagem_servico](#hospedagem_servico) | identificação | Serviço de hospedagem prestado pelo hotel (estadia por quarto e período, ocupantes, custo para a entidade e relatório), base do faturamento.… |
| [hospedagem_tarifas](#hospedagem_tarifas) | — | Tarifas do hotel por pessoas no quarto: custo para o filiado e para a entidade. Migradas do Bubble. |

## fil_reemb_hospedagem

Reembolso de hospedagem a filiado, espelho do Bubble (código, embarque, cancelado). Sem uso encontrado no código além da auditoria Bubble (possível legado); tabela vazia.

- **LGPD:** **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `embarque` | boolean | sim | `false` |  |  | Se o reembolso era ligado a embarque (trabalho embarcado). |
| `cancelado` | boolean | sim | `false` |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `fil_reemb_hospedagem_bubble_id_key`, `fil_reemb_hospedagem_pkey`

## hospedagem_acomodacoes

Quartos do hotel conveniado com a quantidade de hóspedes, espelho do Bubble. Sem uso encontrado no código (possível legado do Bubble); tabela vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `quarto` | text | sim |  |  |  |  |
| `quant_hospedes` | integer | sim |  |  |  |  |
| `hotel_id` | uuid | sim |  | → hospedagem_hotel |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `hospedagem_acomodacoes_bubble_id_key`, `hospedagem_acomodacoes_pkey`

## hospedagem_alocacoes

Distribuição dos cupons nos quartos por noite nos hotéis de demanda garantida (quem dorme em qual quarto dedicado). Gravada pelo motor de alocação em hospedagem-garantida.

- **LGPD:** identificação · titulares: hóspedes (filiados)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `hotel_id` | uuid | sim |  | → hospedagem_hotel (**cascade**) |  |  |
| `cupom_id` | uuid | sim |  |  |  |  |
| `noite` | date | sim |  |  |  |  |
| `quarto` | integer | sim |  |  |  | Número do quarto dedicado (sequencial interno). |
| `sexo` | text | sim |  |  | identificação | Sexo do hóspede, usado para não misturar quartos coletivos. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `hospedagem_alocacoes_pkey`, `idx_hospedagem_alocacoes_hotel_noite`, `ux_hospedagem_alocacoes_cupom_noite`

## hospedagem_avaliacoes

Avaliação da estadia pelo filiado após o checkout (nota, etiquetas, comentário), por link com token; a gestão trata e pode ocultar do hotel.

- **LGPD:** **sensível: sindical**, identificação, **credencial (nunca exportar)** · titulares: hóspedes (filiados)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `cupom_id` | uuid | não |  | → hospedagem_cupom (**cascade**) |  |  |
| `hotel_id` | uuid | não |  | → hospedagem_hotel |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes | **sensível: sindical** | Hóspede filiado; a hospedagem é benefício de filiação. |
| `token` | uuid | não | `gen_random_uuid()` |  | **credencial (nunca exportar)** | Token do link de avaliação enviado ao filiado. |
| `check_in` | date | sim |  |  |  |  |
| `check_out` | date | não |  |  |  |  |
| `situacao` | text | não | `'pendente'::text` |  |  |  |
| `nota` | smallint | sim |  |  |  |  |
| `etiquetas` | text[] | não | `'{}'::text[]` |  |  |  |
| `comentario` | text | sim |  |  | identificação | Texto livre do hóspede. |
| `respondida_em` | timestamp with time zone | sim |  |  |  |  |
| `convite_enviado_em` | timestamp with time zone | sim |  |  |  |  |
| `lembrete_enviado_em` | timestamp with time zone | sim |  |  |  |  |
| `tratada_em` | timestamp with time zone | sim |  |  |  |  |
| `tratada_por_id` | uuid | sim |  | → usuarios |  |  |
| `providencia` | text | sim |  |  |  | O que a gestão fez em resposta à avaliação. |
| `oculta_hotel` | boolean | não | `false` |  |  | Esconde a avaliação da interface do hotel. |
| `ocultada_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `hospedagem_avaliacoes_check` `CHECK (((situacao = 'pendente'::text) OR (nota IS NOT NULL)))`; `hospedagem_avaliacoes_nota_check` `CHECK (((nota IS NULL) OR ((nota >= 1) AND (nota <= 5))))`; `hospedagem_avaliacoes_situacao_check` `CHECK ((situacao = ANY (ARRAY['pendente'::text, 'respondida'::text])))`

Índices: `hospedagem_avaliacoes_pkey`, `idx_hospedagem_avaliacoes_filiado`, `idx_hospedagem_avaliacoes_hotel_checkout`, `ux_hospedagem_avaliacoes_cupom`, `ux_hospedagem_avaliacoes_token`

## hospedagem_beneficiarios

Lista de CPFs autorizados a usar a hospedagem quando a condição somente_beneficiarios está ligada (ex.: não filiados admitidos pela gestão).

- **LGPD:** identificação · titulares: hóspedes/beneficiários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nome` | text | sim |  |  | identificação |  |
| `observacao` | text | sim |  |  | identificação | Motivo da inclusão; texto livre. |
| `incluido_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `hospedagem_beneficiarios_pkey`, `ux_hospedagem_beneficiarios_cpf`

## hospedagem_coletiva

Hospedagem coletiva por data de checkin e acomodação, espelho do Bubble. Sem uso encontrado no código (possível legado do Bubble); tabela vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `checkin` | date | sim |  |  |  |  |
| `acomodacao_id` | uuid | sim |  | → hospedagem_acomodacoes |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `hospedagem_coletiva_bubble_id_key`, `hospedagem_coletiva_pkey`

## hospedagem_condicoes

Condições de uso da hospedagem por entidade (uma linha): restrição por fonte e regime, limite de cupons por período, só beneficiários e punição por não comparecimento.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `restringir_fontes` | boolean | não | `false` |  |  |  |
| `fontes_ids` | uuid[] | não | `'{}'::uuid[]` |  |  | Fontes de filiação admitidas quando restringir_fontes. |
| `limitar_quantidade` | boolean | não | `false` |  |  |  |
| `quantidade_maxima` | integer | não | `1` |  |  |  |
| `quantidade_periodo` | text | não | `'mes'::text` |  |  |  |
| `restringir_regimes` | boolean | não | `false` |  |  |  |
| `regimes` | text[] | não | `'{}'::text[]` |  |  | Regimes de trabalho admitidos quando restringir_regimes. |
| `somente_beneficiarios` | boolean | não | `false` |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `punir_nao_comparecimento` | boolean | não | `false` |  |  |  |
| `nao_comparecimento_quantidade` | integer | não | `1` |  |  |  |
| `nao_comparecimento_janela_meses` | integer | não | `12` |  |  |  |
| `nao_comparecimento_penalidade` | text | não | `'suspender'::text` |  |  | Tipo de punição por faltas (suspensão etc.). |
| `nao_comparecimento_periodo` | text | não | `'mes'::text` |  |  |  |
| `nao_comparecimento_suspensao_dias` | integer | não | `30` |  |  |  |

Checks: `ck_hospedagem_condicoes_nc` `CHECK ((((nao_comparecimento_quantidade >= 1) AND (nao_comparecimento_quantidade <= 50)) AND ((nao_comparecimento_janela_meses >= 1) AND (nao_comparecimento_janela_meses <= 60)) AND (nao_comparecimento_penalidade = ANY (ARRAY['consumir_periodo'::text, 'suspender'::text, 'desabilitar'::text])) AND (nao_comparecimento_periodo = ANY (ARRAY['mes'::text, 'ano'::text])) AND ((nao_comparecimento_suspensao_dias >= 1) AND (nao_comparecimento_suspensao_dias <= 730)))) NOT VALID`; `ck_hospedagem_condicoes_qtd` `CHECK ((((quantidade_maxima >= 1) AND (quantidade_maxima <= 365)) AND (quantidade_periodo = ANY (ARRAY['mes'::text, 'ano'::text])))) NOT VALID`

Índices: `hospedagem_condicoes_pkey`, `ux_hospedagem_condicoes_emp`

## hospedagem_cupom

Cupom de hospedagem: reserva de um filiado em hotel conveniado (datas, tarifa, presença, cancelamento, não comparecimento). Migrado do Bubble e criado pelo portal do associado ou pelo hotel em caso emergencial.

- **LGPD:** **sensível: sindical**, identificação, financeiro, **credencial (nunca exportar)** · titulares: hóspedes (filiados)
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `check_in` | date | sim |  |  | identificação |  |
| `sexo` | sexo_enum | sim |  |  | identificação |  |
| `cancelado` | boolean | sim | `false` |  |  |  |
| `compareceu` | boolean | sim | `false` |  |  |  |
| `tarifa_hospede` | numeric(15,2) | sim |  |  | financeiro | Valor pago pelo filiado. |
| `aceita_quarto_coletivo` | boolean | sim | `false` |  |  | Hóspede aceita dividir quarto. |
| `servico_id` | uuid | sim |  | → hospedagem_servico |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes | **sensível: sindical** | Hóspede filiado; o cupom é benefício de filiação. |
| `hotel_id` | uuid | sim |  | → hospedagem_hotel |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `slug` | text | sim |  |  |  | Identificador curto do cupom em links. |
| `reserva_garantida` | boolean | não | `false` |  |  |  |
| `check_out` | date | sim |  |  | identificação |  |
| `quarto` | integer | sim |  |  |  |  |
| `token` | uuid | sim | `gen_random_uuid()` |  | **credencial (nunca exportar)** | Token do link do cupom. |
| `confirmar_ate` | timestamp with time zone | sim |  |  |  |  |
| `cancelado_em` | timestamp with time zone | sim |  |  |  |  |
| `presenca_em` | timestamp with time zone | sim |  |  |  |  |
| `presenca_por` | uuid | sim |  |  |  |  |
| `presenca_metodo` | text | sim |  |  |  | Como a presença foi registrada (hotel, gestão etc.). |
| `nao_comparecimento_abonado_em` | timestamp with time zone | sim |  |  |  |  |
| `nao_comparecimento_abono_motivo` | text | sim |  |  | identificação | Motivo do abono da falta; texto livre, pode citar saúde. |
| `nao_comparecimento_abonado_por` | uuid | sim |  |  |  |  |
| `emergencial` | boolean | não | `false` |  |  | Cupom criado pelo hotel fora do fluxo normal. |
| `emergencial_por_id` | uuid | sim |  | → hospedagem_hotel_usuarios |  |  |
| `emergencial_em` | timestamp with time zone | sim |  |  |  |  |
| `emergencial_motivo` | text | sim |  |  | identificação | Justificativa do hotel; texto livre. |

Únicas: `UNIQUE (bubble_id)`

Índices: `hospedagem_cupom_bubble_id_key`, `hospedagem_cupom_pkey`, `idx_hospedagem_cupom_emergencial`, `idx_hospedagem_cupom_garantida`, `ux_hospedagem_cupom_token`

## hospedagem_espera

Fila de espera por vaga em hotel de demanda garantida; quando abre vaga a oferta é enviada por link com prazo.

- **LGPD:** **sensível: sindical**, identificação, **credencial (nunca exportar)** · titulares: hóspedes (filiados)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `hotel_id` | uuid | sim |  | → hospedagem_hotel (**cascade**) |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes | **sensível: sindical** |  |
| `cpf` | text | sim |  |  | identificação |  |
| `sexo` | text | sim |  |  | identificação |  |
| `check_in` | date | sim |  |  |  |  |
| `check_out` | date | sim |  |  |  |  |
| `situacao` | text | não | `'aguardando'::text` |  |  |  |
| `motivo` | text | sim |  |  |  | Motivo da situação na fila. |
| `cupom_id` | uuid | sim |  |  |  |  |
| `token` | uuid | sim | `gen_random_uuid()` |  | **credencial (nunca exportar)** | Token do link da oferta de vaga. |
| `oferecida_em` | timestamp with time zone | sim |  |  |  |  |
| `oferta_expira_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_hospedagem_espera_situacao` `CHECK ((situacao = ANY (ARRAY['aguardando'::text, 'oferecida'::text, 'confirmada'::text, 'expirada'::text, 'cancelada'::text]))) NOT VALID`

Índices: `hospedagem_espera_pkey`, `idx_hospedagem_espera_fila`, `ux_hospedagem_espera_token`

## hospedagem_fatura

Fatura do hotel conveniado (código, nota fiscal) que agrupa serviços de hospedagem e vira ordem de pagamento. Migrada do Bubble e lida pela interface do hotel.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `nota_fiscal` | text | sim |  |  |  |  |
| `hotel_id` | uuid | sim |  | → hospedagem_hotel |  |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `hospedagem_fatura_bubble_id_key`, `hospedagem_fatura_pkey`

## hospedagem_hotel

Hotel conveniado: regras do convênio (modalidade normal ou demanda garantida, quartos dedicados, travas, prazos de cancelamento e espera) e dados de exibição. Migrado do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `foto` | text | sim |  |  |  |  |
| `ativo` | boolean | sim | `true` |  |  |  |
| `demanda_garantida` | boolean | sim | `false` |  |  |  |
| `quant_quartos_dedicados` | integer | sim |  |  |  |  |
| `max_hospedes_por_quarto` | integer | sim |  |  |  |  |
| `max_hospedes_por_dia` | integer | sim |  |  |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `contrato_id` | uuid | sim |  | → contratos |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `exige_relatorio_para_faturar` | boolean | não | `false` |  |  |  |
| `acordo_vigencia_inicio` | date | sim |  |  |  |  |
| `acordo_vigencia_fim` | date | sim |  |  |  |  |
| `modalidade` | text | não | `'uso'::text` |  |  | normal ou garantida (quartos dedicados pagos). |
| `quartos_por_dia_semana` | integer[] | sim |  |  |  |  |
| `regra_distribuicao` | text | não | `'lotacao'::text` |  |  | lotacao ou distribuicao dos hóspedes nos quartos. |
| `trava_ultimo_quarto` | boolean | não | `true` |  |  |  |
| `trava_dias_antes` | integer | não | `3` |  |  |  |
| `trava_hora` | time without time zone | não | `'12:00:00'::time without time zone` |  |  |  |
| `max_noites` | integer | não | `7` |  |  |  |
| `horario_checkin` | time without time zone | não | `'14:00:00'::time without time zone` |  |  |  |
| `cancelamento_horas` | integer | não | `24` |  |  |  |
| `espera_prazo_horas` | integer | não | `12` |  |  |  |
| `alocacao_versao` | bigint | não | `0` |  |  | Versão para controle de concorrência do motor de alocação. |
| `fila_processada_em` | timestamp with time zone | sim |  |  |  | Última vez que a fila de espera foi processada. |
| `telefone` | text | sim |  |  |  | Telefone da recepção mostrado ao associado no portal (Hospedagem). |

Únicas: `UNIQUE (bubble_id)`

Checks: `ck_hospedagem_hotel_garantida` `CHECK (((modalidade = ANY (ARRAY['uso'::text, 'garantida'::text])) AND (regra_distribuicao = ANY (ARRAY['lotacao'::text, 'distribuicao'::text])) AND ((trava_dias_antes >= 0) AND (trava_dias_antes <= 60)) AND ((max_noites >= 1) AND (max_noites <= 60)) AND ((cancelamento_horas >= 0) AND (cancelamento_horas <= 720)) AND ((espera_prazo_horas >= 1) AND (espera_prazo_horas <= 168)))) NOT VALID`

Índices: `hospedagem_hotel_bubble_id_key`, `hospedagem_hotel_pkey`

## hospedagem_hotel_contas

Contas bancárias e chaves Pix do hotel para receber pagamentos, cadastradas pela interface do hotel.

- **LGPD:** financeiro, identificação · titulares: titulares de conta do hotel (podem ser pessoa física)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `hotel_id` | uuid | não |  | → hospedagem_hotel |  |  |
| `tipo` | text | não |  |  |  |  |
| `titular` | text | sim |  |  | identificação | Titular da conta; em geral o hotel, mas pode ser pessoa física. |
| `documento` | text | sim |  |  | identificação | CPF ou CNPJ do titular. |
| `banco` | text | sim |  |  | financeiro |  |
| `agencia` | text | sim |  |  | financeiro |  |
| `conta` | text | sim |  |  | financeiro |  |
| `chave_pix` | text | sim |  |  | financeiro |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |

Checks: `hospedagem_hotel_contas_tipo_check` `CHECK ((tipo = ANY (ARRAY['pix'::text, 'deposito'::text])))`

Índices: `hospedagem_hotel_contas_hotel_idx`, `hospedagem_hotel_contas_pkey`

## hospedagem_hotel_usuarios

Usuários do hotel com acesso à interface /hotel (login próprio) e permissões por área.

- **LGPD:** identificação · titulares: usuários do sistema (funcionários do hotel)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `hotel_id` | uuid | não |  | → hospedagem_hotel |  |  |
| `email` | text | não |  |  | identificação |  |
| `nome` | text | sim |  |  | identificação |  |
| `auth_user_id` | uuid | sim |  |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `permissoes` | jsonb | sim |  |  |  | Acesso por área da interface do hotel: {"<area>": "ver"\|"editar"}; área ausente = sem acesso; NULO = acesso completo. |

Únicas: `UNIQUE (email)`

Índices: `hospedagem_hotel_usuarios_auth_idx`, `hospedagem_hotel_usuarios_email_key`, `hospedagem_hotel_usuarios_hotel_idx`, `hospedagem_hotel_usuarios_pkey`

## hospedagem_penalidade_liberacoes

Liberação manual, pela gestão, de um CPF punido por não comparecimento, com motivo.

- **LGPD:** identificação · titulares: hóspedes (filiados)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `motivo` | text | sim |  |  | identificação | Motivo da liberação; texto livre. |
| `liberado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `hospedagem_penalidade_liberacoes_pkey`, `idx_hospedagem_liberacoes_cpf`

## hospedagem_quartos_noite

Anotação do número real do quarto do hotel para cada quarto dedicado e noite, feita na interface do hotel (demanda garantida).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `hotel_id` | uuid | sim |  | → hospedagem_hotel (**cascade**) |  |  |
| `noite` | date | sim |  |  |  |  |
| `quarto` | integer | sim |  |  |  |  |
| `quarto_hotel` | text | sim |  |  |  | Número do quarto no hotel correspondente ao quarto interno. |
| `anotado_por` | uuid | sim |  |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `hospedagem_quartos_noite_pkey`, `ux_hospedagem_quartos_noite`

## hospedagem_reembolso

Reembolso de hospedagem com código e programação SITAER ligado a ordem de pagamento, espelho do Bubble. Sem uso encontrado no código (possível legado do Bubble); tabela vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `programacao_sitaer` | text | sim |  |  |  | Programação de embarque no sistema SITAER da Petrobras. |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `hospedagem_reembolso_bubble_id_key`, `hospedagem_reembolso_pkey`

## hospedagem_servico

Serviço de hospedagem prestado pelo hotel (estadia por quarto e período, ocupantes, custo para a entidade e relatório), base do faturamento. Migrado do Bubble.

- **LGPD:** identificação · titulares: hóspedes (filiados)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `checkin_date` | date | sim |  |  |  |  |
| `checkout_date` | date | sim |  |  |  |  |
| `sexo` | sexo_enum | sim |  |  | identificação |  |
| `coletivo` | boolean | sim | `false` |  |  | Quarto compartilhado. |
| `finalizado` | boolean | sim | `false` |  |  |  |
| `custo_entidade` | numeric(15,2) | sim |  |  |  | Custo da estadia para a entidade. |
| `quant_ocupantes` | integer | sim |  |  |  |  |
| `relatorio` | text | sim |  |  | identificação | Relatório do hotel sobre a estadia; texto livre, pode citar hóspedes. |
| `hotel_id` | uuid | sim |  | → hospedagem_hotel |  |  |
| `fatura_id` | uuid | sim |  | → hospedagem_fatura |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `acomodacao_id` | uuid | sim |  | → hospedagem_acomodacoes |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `slug` | text | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `hospedagem_servico_bubble_id_key`, `hospedagem_servico_pkey`, `idx_bub_hospedagem_servico`

## hospedagem_tarifas

Tarifas do hotel por pessoas no quarto: custo para o filiado e para a entidade. Migradas do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `custo_por_filiado` | numeric(15,2) | sim |  |  |  |  |
| `custo_entidade` | numeric(15,2) | sim |  |  |  |  |
| `pessoas_por_quarto` | integer | sim |  |  |  |  |
| `hotel_id` | uuid | sim |  | → hospedagem_hotel |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `slug` | text | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `hospedagem_tarifas_bubble_id_key`, `hospedagem_tarifas_pkey`
