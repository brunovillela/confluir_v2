<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Veículos e condutores

23 tabelas. Diagrama: [er/veiculos.md](../er/veiculos.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [cnh](#cnh) | identificação | CNH de usuário (número, categoria, vencimento, arquivo), herdada do Bubble. Tabela vazia e sem uso no código; substituída por veiculos_condu… |
| [veiculo_contrato_aluguel_vinculo](#veiculo_contrato_aluguel_vinculo) | — | Histórico dos veículos de cada contrato de locação: um vínculo por período em que o veículo esteve no contrato (início, término, franquia de… |
| [veiculo_contratos_aluguel](#veiculo_contratos_aluguel) | identificação | Contrato de locação de veículos: locadora, vigência, valor mensal, uso (dedicado a um condutor ou coletivo) e a justificativa. Migrado do Bu… |
| [veiculos](#veiculos) | identificação | Veículo da frota da entidade (próprio ou alugado): placa, RENAVAM, documentos, seguro, situação e condutor dedicado. Migrado do Bubble; tela… |
| [veiculos_abastecimentos](#veiculos_abastecimentos) | identificação | Espelho de "Veículos Abastecimentos" do Bubble |
| [veiculos_abastecimentos_lotes](#veiculos_abastecimentos_lotes) | — | Lote de importação de abastecimentos a partir de relatório/fatura lido por IA: arquivo, quem importou e quantas linhas. |
| [veiculos_agendamentos](#veiculos_agendamentos) | identificação | Espelho de "Veículos Agendamentos" do Bubble |
| [veiculos_checklist_apontamentos](#veiculos_checklist_apontamentos) | identificação | Apontamento (item não conforme) do checklist de um veículo, com vida própria: aberto num checklist, confirmado ou sanado nos seguintes, com … |
| [veiculos_checklist_config](#veiculos_checklist_config) | — | Configuração do checklist periódico da frota por tenant: recorrência em dias e antecedência do alerta. |
| [veiculos_checklist_itens](#veiculos_checklist_itens) | — | Item configurável do checklist de veículos (categoria, o que verificar, propósito), substituto de veiculos_verificacao. |
| [veiculos_checklist_respostas](#veiculos_checklist_respostas) | — | Resposta de cada item num checklist realizado (situação e observação). |
| [veiculos_checklists](#veiculos_checklists) | — | Checklist de inspeção realizado em um veículo: data, hodômetro, inspetor e número de pendências. |
| [veiculos_condutores](#veiculos_condutores) | identificação | Cadastro de condutor autorizado da frota (usuário + CNH vigente + autorização), tela Veículos > Condutores. |
| [veiculos_condutores_cnh](#veiculos_condutores_cnh) | identificação | Histórico das CNHs de um condutor (a anterior vai para cá ao ser substituída ou na unificação de cadastros). |
| [veiculos_condutores_unificacoes](#veiculos_condutores_unificacoes) | identificação | Registro de cada unificação de dois cadastros de condutor da mesma pessoa, com o antes e os ids movidos, para conferir ou desfazer. |
| [veiculos_contratos_historico](#veiculos_contratos_historico) | identificação | Trilha do contrato de locação de veículos: edições e prorrogações, com quem fez, motivo, antes/depois e o aditivo. |
| [veiculos_disponibilidade](#veiculos_disponibilidade) | identificação | Espelho de "Veículos disponibilidade" do Bubble |
| [veiculos_infracoes](#veiculos_infracoes) | identificação, financeiro | Multa de trânsito de veículo da frota: auto, condutor infrator, justificativa, reembolso e cobrança ao infrator. Migrada do Bubble; tela Veí… |
| [veiculos_infracoes_config](#veiculos_infracoes_config) | identificação | Configuração das infrações por tenant: e-mails que recebem cópia das notificações. |
| [veiculos_infracoes_historico](#veiculos_infracoes_historico) | identificação | Trilha de eventos de uma infração (notificação, justificativa, cobrança, baixa) com usuário e detalhe. |
| [veiculos_manutencao_planos](#veiculos_manutencao_planos) | — | Plano de manutenção preventiva de um veículo por intervalo de dias e/ou km, com alertas. |
| [veiculos_manutencoes](#veiculos_manutencoes) | — | Manutenção realizada em veículo: tipo, oficina, valor, nota fiscal, garantia e plano atendido. |
| [veiculos_verificacao](#veiculos_verificacao) | — | Inspeção de veículo herdada do Bubble, com um par de colunas fixo por item (buzina/buzina_ok etc.). Vazia e sem uso; substituída por veiculo… |

## cnh

CNH de usuário (número, categoria, vencimento, arquivo), herdada do Bubble. Tabela vazia e sem uso no código; substituída por veiculos_condutores e veiculos_condutores_cnh.

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `numero` | text | sim |  |  | identificação |  |
| `categoria` | text | sim |  |  | identificação |  |
| `registro` | text | sim |  |  | identificação | Número de registro da CNH. |
| `vencimento` | date | sim |  |  | identificação |  |
| `arquivo` | text | sim |  |  | identificação | Imagem/PDF da CNH (documento com foto). |
| `autorizado` | boolean | sim | `false` |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `cnh_bubble_id_key`, `cnh_pkey`

## veiculo_contrato_aluguel_vinculo

Histórico dos veículos de cada contrato de locação: um vínculo por período em que o veículo esteve no contrato (início, término, franquia de km). Finalizar o contrato fecha o período e mantém o veículo no histórico; desvincular antes do fim marca desvinculado. Origem Bubble; usado pela tela do contrato desde 29/10/2026.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `inicio` | date | sim |  |  | nenhum | Quando o veículo entrou no contrato. |
| `termino` | date | sim |  |  | nenhum | Quando saiu (desvinculado ou contrato finalizado); nulo = segue no contrato. |
| `desvinculado` | boolean | sim | `false` |  | nenhum | true = tirado do contrato antes do fim; false com término = ficou até a finalização. |
| `km_mensal_franquia` | integer | sim |  |  | nenhum | Km mensal incluído no aluguel. |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `contrato_id` | uuid | sim |  | → veiculo_contratos_aluguel |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa | nenhum | Entidade dona (tenant), herdada do contrato. |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_veiculo_contrato_aluguel_vinculo_contrato`, `idx_veiculo_contrato_aluguel_vinculo_veiculo`, `veiculo_contratos_aluguel_bubble_id_key`, `veiculo_contratos_aluguel_pkey`

## veiculo_contratos_aluguel

Contrato de locação de veículos: locadora, vigência, valor mensal, uso (dedicado a um condutor ou coletivo) e a justificativa. Migrado do Bubble ("Veículos Contratos de aluguel"); tela Veículos › Contratos de aluguel.

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `aprovacao_raw` | text | sim |  |  |  | bubble_id de Aquisição - Aprovações -- TODO: normalizar |
| `arquivo_contrato_url` | text | sim |  |  |  | URL do arquivo no Bubble CDN -- TODO: migrar para Supabase Storage |
| `centro_custo_id` | uuid | sim |  | → centros_de_custo |  |  |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `finalizado` | boolean | sim |  |  |  |  |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `numero_contrato_locadora` | text | sim |  |  |  |  |
| `ordens_pagto` | jsonb | sim |  |  |  | Lista de bubble_ids de Financeiro - Ordem pgtos -- TODO: normalizar (junção N:N) |
| `responsavel_id` | uuid | sim |  | → usuarios |  |  |
| `vigencia_inicio` | date | sim |  |  |  |  |
| `vigencia_termino` | date | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `valor_mensal` | numeric | sim |  |  |  |  |
| `finalidade` | text | sim |  |  |  |  |
| `uso` | text | sim |  |  | nenhum | dedicado (um condutor fixo; fora das opções da recepção) ou coletivo (sem vínculo fixo; lista própria na página de Veículos). Nulo nos contratos antigos. |
| `uso_justificativa` | text | sim |  |  | nenhum | Por que a entidade precisa do carro nesse uso (obrigatória nos contratos novos). |
| `condutor_dedicado_id` | uuid | sim |  | → usuarios | identificação | Condutor a quem o carro do contrato dedicado fica vinculado; a troca fica no histórico do contrato. |

Únicas: `UNIQUE (bubble_id)`

Checks: `veiculo_contratos_aluguel_uso_check` `CHECK ((uso = ANY (ARRAY['dedicado'::text, 'coletivo'::text])))`

Índices: `idx_veiculo_contratos_aluguel_condutor`, `veiculo_contratos_aluguel_bubble_id_key1`, `veiculo_contratos_aluguel_pkey1`

## veiculos

Veículo da frota da entidade (próprio ou alugado): placa, RENAVAM, documentos, seguro, situação e condutor dedicado. Migrado do Bubble; tela Veículos.

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `placa` | text | sim |  |  |  |  |
| `cor` | text | sim |  |  |  |  |
| `renavan` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `inicio` | date | sim |  |  |  |  |
| `lotacao` | text | sim |  |  |  |  |
| `termino` | date | sim |  |  |  |  |
| `ativo` | boolean | sim |  |  |  |  |
| `condutor` | text | sim |  |  | identificação | Nome do condutor dedicado (texto do Bubble). |
| `crlv` | jsonb | sim |  |  |  | Arquivo(s) do CRLV do veículo. |
| `combustivel` | text | sim |  |  |  |  |
| `inativo` | boolean | sim | `false` |  |  |  |
| `dedicacao` | boolean | sim |  |  |  | Veículo dedicado a um condutor fixo. |
| `marca_modelo` | text | sim |  |  |  |  |
| `eh_alugado` | boolean | sim |  |  |  |  |
| `ano_modelo` | date | sim |  |  |  |  |
| `manutencao` | boolean | sim |  |  |  |  |
| `seguro_apolice_url` | text | sim |  |  |  |  |
| `ano_fabricacao` | date | sim |  |  |  |  |
| `seguro_vencimento` | date | sim |  |  |  |  |
| `contrato_locacao_url` | text | sim |  |  |  |  |
| `crv_transferencia_url` | text | sim |  |  |  |  |
| `lotacao_os` | text | sim |  |  |  | Sede de lotação como option set do Bubble. |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `contrato_aluguel_id` | uuid | sim |  | → veiculo_contratos_aluguel |  |  |
| `checklist_recorrencia_dias` | integer | sim |  |  |  |  |
| `manutencao_desde` | timestamp with time zone | sim |  |  |  |  |
| `inativo_desde` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_bub_veiculos`, `idx_veiculos_contrato`, `veiculos_bubble_id_key`, `veiculos_pkey`

## veiculos_abastecimentos

Espelho de "Veículos Abastecimentos" do Bubble

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `posto` | text | sim |  |  |  |  |
| `cidade` | text | sim |  |  |  |  |
| `combustivel` | text | sim |  |  |  |  |
| `volume_abastecido` | numeric | sim |  |  |  |  |
| `valor_abastecimento` | numeric | sim |  |  |  |  |
| `data_hora_abastecimento` | timestamp with time zone | sim |  |  |  |  |
| `combustivel_tipo` | text | sim |  |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `hodometro` | numeric | sim |  |  |  |  |
| `lote_id` | uuid | sim |  | → veiculos_abastecimentos_lotes |  |  |
| `placa_informada` | text | sim |  |  |  | Placa como veio no relatório/fatura (a leitura pela IA grava sempre; sem veículo, é o que resta para vincular). |
| `condutor_informado` | text | sim |  |  | identificação | Nome do motorista como veio no relatório, quando não foi identificado entre os condutores. |
| `comprovante_url` | text | sim |  |  | nenhum | Caminho do cupom/nota do abastecimento no bucket 'veiculos' (mandado pelo bot do Telegram). |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_veiculos_abastecimentos_data`, `idx_veiculos_abastecimentos_lote`, `idx_veiculos_abastecimentos_veiculo`, `veiculos_abastecimentos_bubble_id_key`, `veiculos_abastecimentos_pkey`, `veiculos_abastecimentos_sem_veiculo_idx`, `veiculos_abastecimentos_veic_data_idx`

## veiculos_abastecimentos_lotes

Lote de importação de abastecimentos a partir de relatório/fatura lido por IA: arquivo, quem importou e quantas linhas.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `arquivo_nome` | text | sim |  |  |  |  |
| `importado_por_id` | uuid | sim |  | → usuarios |  |  |
| `qtd_linhas` | integer | não | `0` |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `veiculos_abastecimentos_lotes_pkey`

## veiculos_agendamentos

Espelho de "Veículos Agendamentos" do Bubble

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `motivo` | text | sim |  |  | identificação | Motivo da reserva; texto livre. |
| `destino` | text | sim |  |  | identificação | Destino da viagem do condutor. |
| `atendido` | boolean | sim |  |  |  |  |
| `data_retorno` | date | sim |  |  |  |  |
| `data_retirada` | date | sim |  |  |  |  |
| `sede_retirada_os` | text | sim |  |  |  | Sede de retirada como option set do Bubble. |
| `condutor_id` | uuid | sim |  | → usuarios |  |  |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `situacao` | text | sim |  |  |  |  |
| `atendido_por_id` | uuid | sim |  | → usuarios |  |  |
| `atendido_em` | timestamp with time zone | sim |  |  |  |  |
| `negado_motivo` | text | sim |  |  |  | Motivo da recusa da reserva. |
| `cancelado_por_id` | uuid | sim |  | → usuarios |  | Usuário que cancelou (o próprio condutor ou a recepção). Cancelar não exclui: situacao = cancelada. |
| `cancelado_em` | timestamp with time zone | sim |  |  |  |  |
| `solicitado_por_id` | uuid | sim |  | → usuarios |  | Quem registrou a solicitação em nome do condutor (recepção). Nulo = o próprio condutor. |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_veiculos_agendamentos_condutor`, `idx_veiculos_agendamentos_situacao`, `veiculos_agendamentos_bubble_id_key`, `veiculos_agendamentos_pkey`

## veiculos_checklist_apontamentos

Apontamento (item não conforme) do checklist de um veículo, com vida própria: aberto num checklist, confirmado ou sanado nos seguintes, com tempo em aberto e a manutenção corretiva vinculada. Só um checklist que o declare sanado o encerra.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa | nenhum | Entidade dona (tenant). |
| `veiculo_id` | uuid | não |  | → veiculos (**cascade**) | nenhum | Veículo apontado. |
| `item_id` | uuid | sim |  | → veiculos_checklist_itens (set null) | nenhum | Item do checklist (veiculos_checklist_itens); nulo se o item foi excluído. |
| `categoria` | text | não |  |  | nenhum | Nome do item no momento da abertura (sobrevive à edição do catálogo). |
| `descricao` | text | sim |  |  | nenhum | O que foi encontrado, na abertura. |
| `situacao` | text | não | `'aberto'::text` |  | nenhum | aberto \| resolvido. Só o checklist muda para resolvido. |
| `aberto_em` | timestamp with time zone | não |  |  | nenhum | Momento do checklist que abriu o apontamento (marcador do tempo em aberto). |
| `checklist_abertura_id` | uuid | sim |  | → veiculos_checklists (set null) | nenhum | Checklist que abriu. |
| `confirmacoes` | integer | não | `0` |  | nenhum | Quantos checklists seguintes confirmaram que o problema permanece. |
| `ultima_confirmacao_em` | timestamp with time zone | sim |  |  | nenhum | Último checklist que confirmou que permanece. |
| `ultima_observacao` | text | sim |  |  | nenhum | Como estava na última confirmação, se o inspetor descreveu. |
| `resolvido_em` | timestamp with time zone | sim |  |  | nenhum | Momento do checklist que o declarou sanado. |
| `checklist_resolucao_id` | uuid | sim |  | → veiculos_checklists (set null) | nenhum | Checklist que o declarou sanado. |
| `resolvido_por` | uuid | sim |  | → usuarios | identificação | Inspetor do checklist que o declarou sanado. |
| `manutencao_id` | uuid | sim |  | → veiculos_manutencoes (set null) | nenhum | Manutenção (corretiva) vinculada ao apontamento; vincular não o encerra. |
| `created_at` | timestamp with time zone | não | `now()` |  | nenhum | Quando o registro foi criado. |

Checks: `veiculos_checklist_apontamentos_situacao_check` `CHECK ((situacao = ANY (ARRAY['aberto'::text, 'resolvido'::text])))`

Índices: `idx_veiculos_checklist_apontamentos_veiculo`, `veiculos_checklist_apontamentos_aberto_unico`, `veiculos_checklist_apontamentos_pkey`

## veiculos_checklist_config

Configuração do checklist periódico da frota por tenant: recorrência em dias e antecedência do alerta.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `recorrencia_dias` | integer | não | `30` |  |  |  |
| `alerta_antecedencia_dias` | integer | não | `3` |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `ux_veic_check_config_emp`, `veiculos_checklist_config_pkey`

## veiculos_checklist_itens

Item configurável do checklist de veículos (categoria, o que verificar, propósito), substituto de veiculos_verificacao.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `categoria` | text | sim |  |  |  |  |
| `itens_verificar` | text | sim |  |  |  |  |
| `proposito` | text | sim |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `ux_veic_check_itens_categoria`, `veiculos_checklist_itens_pkey`

## veiculos_checklist_respostas

Resposta de cada item num checklist realizado (situação e observação).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `checklist_id` | uuid | sim |  | → veiculos_checklists (**cascade**) |  |  |
| `item_id` | uuid | sim |  | → veiculos_checklist_itens |  |  |
| `categoria` | text | sim |  |  |  |  |
| `situacao` | text | sim |  |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `ck_veic_check_resp_situacao` `CHECK ((situacao = ANY (ARRAY['conforme'::text, 'nao_conforme'::text, 'nao_aplica'::text]))) NOT VALID`

Índices: `idx_veic_check_resp_checklist`, `veiculos_checklist_respostas_pkey`

## veiculos_checklists

Checklist de inspeção realizado em um veículo: data, hodômetro, inspetor e número de pendências.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `realizado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `hodometro` | numeric | sim |  |  |  |  |
| `inspetor_id` | uuid | sim |  | → usuarios |  |  |
| `observacoes` | text | sim |  |  |  |  |
| `pendencias` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `idx_veic_checklists_veiculo`, `veiculos_checklists_pkey`

## veiculos_condutores

Cadastro de condutor autorizado da frota (usuário + CNH vigente + autorização), tela Veículos > Condutores.

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `usuario_id` | uuid | não |  | → usuarios |  |  |
| `cnh_numero` | text | sim |  |  | identificação |  |
| `cnh_categoria` | text | sim |  |  | identificação |  |
| `cnh_validade` | date | sim |  |  | identificação |  |
| `cnh_arquivo_url` | text | sim |  |  | identificação | Imagem/PDF da CNH. |
| `autorizado` | boolean | não | `false` |  |  |  |
| `autorizado_por_id` | uuid | sim |  | → usuarios |  |  |
| `autorizado_em` | timestamp with time zone | sim |  |  |  |  |
| `observacao` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (usuario_id)`

Índices: `veiculos_condutores_pkey`, `veiculos_condutores_usuario_id_key`

## veiculos_condutores_cnh

Histórico das CNHs de um condutor (a anterior vai para cá ao ser substituída ou na unificação de cadastros).

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `condutor_id` | uuid | sim |  | → veiculos_condutores (**cascade**) |  |  |
| `cnh_numero` | text | sim |  |  | identificação |  |
| `cnh_categoria` | text | sim |  |  | identificação |  |
| `cnh_validade` | date | sim |  |  | identificação |  |
| `cnh_arquivo_url` | text | sim |  |  | identificação |  |
| `origem` | text | não | `'renovacao'::text` |  |  | Por que a CNH foi para o histórico (substituição, unificação). |
| `usuario_origem_id` | uuid | sim |  | → usuarios |  |  |
| `registrado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_veiculos_condutores_cnh`, `veiculos_condutores_cnh_pkey`

## veiculos_condutores_unificacoes

Registro de cada unificação de dois cadastros de condutor da mesma pessoa, com o antes e os ids movidos, para conferir ou desfazer.

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `principal_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `secundario_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `cadastro_removido` | jsonb | sim |  |  | identificação | Cópia da linha do condutor secundário, inclusive CNH. |
| `cadastro_principal_antes` | jsonb | sim |  |  | identificação | Cópia da linha do condutor principal antes da unificação. |
| `movidos` | jsonb | sim |  |  |  | Ids movidos por tabela. |
| `feito_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `veiculos_condutores_unificacoes_pkey`

## veiculos_contratos_historico

Trilha do contrato de locação de veículos: edições e prorrogações, com quem fez, motivo, antes/depois e o aditivo.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `contrato_id` | uuid | não |  | → veiculo_contratos_aluguel (**cascade**) | nenhum | Contrato de locação (veiculo_contratos_aluguel). |
| `evento` | text | não |  |  | nenhum | editado: correção dos dados cadastrais; prorrogado: novo término (e, se mudou, novo valor mensal). |
| `usuario_id` | uuid | sim |  | → usuarios | identificação | Quem fez a alteração. |
| `motivo` | text | sim |  |  | nenhum | Motivo informado (obrigatório na edição; opcional na prorrogação). |
| `antes` | jsonb | sim |  |  | nenhum | Valores das colunas alteradas antes da mudança. |
| `depois` | jsonb | sim |  |  | nenhum | Valores das colunas alteradas depois da mudança. |
| `arquivo_aditivo_url` | text | sim |  |  | nenhum | Caminho do aditivo assinado no bucket veiculos (prorrogação). |
| `created_at` | timestamp with time zone | não | `now()` |  | nenhum | Quando a alteração foi feita. |
| `emp_proprietaria_id` | uuid | sim |  | → empresa | nenhum | Entidade dona (tenant). |

Checks: `veiculos_contratos_historico_evento_check` `CHECK ((evento = ANY (ARRAY['editado'::text, 'prorrogado'::text])))`

Índices: `idx_veiculos_contratos_historico`, `veiculos_contratos_historico_pkey`

## veiculos_disponibilidade

Espelho de "Veículos disponibilidade" do Bubble

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `sede_retirada` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `motivo` | text | sim |  |  | identificação |  |
| `destino` | text | sim |  |  | identificação |  |
| `observacao_retorno` | text | sim |  |  | identificação |  |
| `km_rodado` | numeric | sim |  |  |  |  |
| `data_devolucao` | date | sim |  |  |  |  |
| `disponivel` | boolean | sim |  |  |  |  |
| `manutencao` | boolean | sim |  |  |  |  |
| `hodometro_retirada` | numeric | sim |  |  |  |  |
| `sede_devolucao` | text | sim |  |  |  |  |
| `previsao_retorno` | date | sim |  |  |  | Previsão de retorno informada pela recepção na saída (facultativa). |
| `tempo_com_veiculo` | numeric | sim |  |  |  | Tempo que o condutor ficou com o veículo. |
| `data_retirada` | date | sim |  |  |  |  |
| `hodometro_devolucao` | numeric | sim |  |  |  |  |
| `previsao_retorno_negada` | boolean | sim |  |  |  |  |
| `sede_retirada_os` | text | sim |  |  |  |  |
| `sede_devolucao_os` | text | sim |  |  |  |  |
| `condutor_id` | uuid | sim |  | → usuarios |  |  |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `agendamento_id` | uuid | sim |  | → veiculos_agendamentos |  |  |
| `registrado_por_id` | uuid | sim |  | → usuarios |  |  |
| `retirada_em` | timestamp with time zone | sim |  |  |  |  |
| `devolucao_em` | timestamp with time zone | sim |  |  |  |  |
| `devolucao_registrada_por_id` | uuid | sim |  | → usuarios |  | Quem registrou a entrada do veículo (a saída fica em registrado_por_id). |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_veiculos_disponibilidade_abertas`, `idx_veiculos_disponibilidade_condutor`, `idx_veiculos_disponibilidade_ultima`, `idx_veiculos_disponibilidade_veiculo`, `veiculos_disponibilidade_bubble_id_key`, `veiculos_disponibilidade_pkey`

## veiculos_infracoes

Multa de trânsito de veículo da frota: auto, condutor infrator, justificativa, reembolso e cobrança ao infrator. Migrada do Bubble; tela Veículos > Infrações.

- **LGPD:** identificação, financeiro · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `infracao_data` | date | sim |  |  |  |  |
| `infracao_tipo` | text | sim |  |  |  |  |
| `infracao_orgao_autuador` | text | sim |  |  |  |  |
| `infracao_local` | text | sim |  |  | identificação |  |
| `infracao_auto_de` | text | sim |  |  |  |  |
| `infracao_descricao` | text | sim |  |  |  |  |
| `infracao_custo` | numeric(15,2) | sim |  |  |  |  |
| `boleto` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `notificacao_infrator` | boolean | sim | `false` |  |  |  |
| `notificacao_infrator_quando` | date | sim |  |  |  |  |
| `reembolso` | boolean | sim | `false` |  |  |  |
| `reembolso_quando` | date | sim |  |  |  |  |
| `reembolso_obs_financeiro` | text | sim |  |  | financeiro |  |
| `avaliacao_quando` | date | sim |  |  |  |  |
| `justificativa_quando` | date | sim |  |  |  |  |
| `justificativa_descricao` | text | sim |  |  | identificação |  |
| `justificativa_sindical` | boolean | sim | `false` |  |  | Infração justificada como de interesse sindical (entidade arca). |
| `infracao_arquivo_notificacao` | text | sim |  |  |  |  |
| `reembolso_infrator` | text | sim |  |  | financeiro | Reembolso devido pelo condutor infrator. |
| `identificacao_real_infrator` | text | sim |  |  | identificação | Documento de indicação do condutor real ao órgão. |
| `formaliz_real_infrator` | text | sim |  |  | identificação |  |
| `ordem_pagamento` | text | sim |  |  |  |  |
| `condutor_infrator_id` | uuid | sim |  | → usuarios |  |  |
| `reembolso_avaliador_id` | uuid | sim |  | → usuarios |  |  |
| `avaliacao_verificador_id` | uuid | sim |  | → usuarios |  |  |
| `justificativa_avaliador_id` | uuid | sim |  | → usuarios |  |  |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `cobranca_forma` | text | sim |  |  | financeiro | Como a multa é cobrada do condutor. |
| `cobranca_situacao` | text | sim |  |  | financeiro |  |
| `cobranca_valor` | numeric | sim |  |  | financeiro |  |
| `baixa_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `baixa_em` | timestamp with time zone | sim |  |  |  |  |
| `baixa_observacao` | text | sim |  |  | financeiro |  |
| `baixa_comprovante_url` | text | sim |  |  | financeiro | Comprovante de pagamento do condutor. |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_veiculos_infracoes_cobranca`, `idx_veiculos_infracoes_veiculo`, `veiculos_infracoes_bubble_id_key`, `veiculos_infracoes_pkey`

## veiculos_infracoes_config

Configuração das infrações por tenant: e-mails que recebem cópia das notificações.

- **LGPD:** identificação · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `emails_copia` | text[] | não | `'{}'::text[]` |  | identificação |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `ux_veic_infracoes_config_emp`, `veiculos_infracoes_config_pkey`

## veiculos_infracoes_historico

Trilha de eventos de uma infração (notificação, justificativa, cobrança, baixa) com usuário e detalhe.

- **LGPD:** identificação · titulares: condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `infracao_id` | uuid | não |  | → veiculos_infracoes |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `evento` | text | não |  |  |  |  |
| `detalhe` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |

Índices: `idx_veiculos_infracoes_historico`, `veiculos_infracoes_historico_pkey`

## veiculos_manutencao_planos

Plano de manutenção preventiva de um veículo por intervalo de dias e/ou km, com alertas.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `descricao` | text | sim |  |  |  |  |
| `intervalo_dias` | integer | sim |  |  |  |  |
| `intervalo_km` | integer | sim |  |  |  |  |
| `base_data` | date | sim |  |  |  |  |
| `base_hodometro` | numeric | sim |  |  |  |  |
| `alerta_dias` | integer | não | `15` |  |  |  |
| `alerta_km` | integer | não | `500` |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_veic_planos_intervalo` `CHECK (((COALESCE(intervalo_dias, 0) > 0) OR (COALESCE(intervalo_km, 0) > 0))) NOT VALID`

Índices: `idx_veic_manut_planos_veiculo`, `veiculos_manutencao_planos_pkey`

## veiculos_manutencoes

Manutenção realizada em veículo: tipo, oficina, valor, nota fiscal, garantia e plano atendido.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `tipo` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `realizada_em` | date | sim |  |  |  |  |
| `hodometro` | numeric | sim |  |  |  |  |
| `local_id` | uuid | sim |  | → empresa |  |  |
| `local_nome` | text | sim |  |  |  |  |
| `valor` | numeric | sim |  |  |  |  |
| `compra_id` | uuid | sim |  | → compras_solicitacoes |  |  |
| `nota_fiscal_numero` | text | sim |  |  |  |  |
| `nota_fiscal_url` | text | sim |  |  |  |  |
| `garantia_meses` | integer | sim |  |  |  |  |
| `garantia_km` | integer | sim |  |  |  |  |
| `garantia_ate` | date | sim |  |  |  |  |
| `garantia_hodometro` | numeric | sim |  |  |  |  |
| `plano_id` | uuid | sim |  | → veiculos_manutencao_planos (set null) |  |  |
| `observacoes` | text | sim |  |  |  |  |
| `registrada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_veic_manut_tipo` `CHECK ((tipo = ANY (ARRAY['preventiva'::text, 'corretiva'::text]))) NOT VALID`

Índices: `idx_veic_manut_plano`, `idx_veic_manut_veiculo`, `veiculos_manutencoes_pkey`

## veiculos_verificacao

Inspeção de veículo herdada do Bubble, com um par de colunas fixo por item (buzina/buzina_ok etc.). Vazia e sem uso; substituída por veiculos_checklists e veiculos_checklist_respostas.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `data_hora_inspecao` | timestamp with time zone | sim |  |  |  |  |
| `hodometro` | numeric | sim |  |  |  |  |
| `documento_no_veiculo` | boolean | sim |  |  |  |  |
| `buzina` | text | sim |  |  |  |  |
| `buzina_ok` | boolean | sim |  |  |  |  |
| `farois` | text | sim |  |  |  |  |
| `farois_ok` | boolean | sim |  |  |  |  |
| `lataria` | text | sim |  |  |  |  |
| `lataria_ok` | boolean | sim |  |  |  |  |
| `luzes_re` | text | sim |  |  |  |  |
| `luzes_re_ok` | boolean | sim |  |  |  |  |
| `pisca_alerta` | text | sim |  |  |  |  |
| `pisca_alerta_ok` | boolean | sim |  |  |  |  |
| `retrovisores` | text | sim |  |  |  |  |
| `retrovisores_ok` | boolean | sim |  |  |  |  |
| `kit_seguranca` | text | sim |  |  |  |  |
| `kit_seguranca_ok` | boolean | sim |  |  |  |  |
| `nivel_oleo_motor` | text | sim |  |  |  |  |
| `nivel_oleo_motor_ok` | boolean | sim |  |  |  |  |
| `luzes_freio` | text | sim |  |  |  |  |
| `luzes_freio_ok` | boolean | sim |  |  |  |  |
| `pneus_estepe` | text | sim |  |  |  |  |
| `pneus_estepe_ok` | boolean | sim |  |  |  |  |
| `nivel_agua_motor` | text | sim |  |  |  |  |
| `nivel_agua_motor_ok` | boolean | sim |  |  |  |  |
| `bancos_assentos` | text | sim |  |  |  |  |
| `bancos_assentos_ok` | boolean | sim |  |  |  |  |
| `parabrisa_vidros` | text | sim |  |  |  |  |
| `parabrisa_vidros_ok` | boolean | sim |  |  |  |  |
| `nivel_agua_parabrisa` | text | sim |  |  |  |  |
| `nivel_agua_parabrisa_ok` | boolean | sim |  |  |  |  |
| `limpador_parabrisa` | text | sim |  |  |  |  |
| `limpador_parabrisa_ok` | boolean | sim |  |  |  |  |
| `freio_estacionamento` | text | sim |  |  |  |  |
| `freio_estacionamento_ok` | boolean | sim |  |  |  |  |
| `nivel_oleo_hidraulico` | text | sim |  |  |  |  |
| `nivel_oleo_hidraulico_ok` | boolean | sim |  |  |  |  |
| `inspetor_id` | uuid | sim |  | → usuarios |  |  |
| `veiculo_id` | uuid | sim |  | → veiculos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `veiculos_verificacao_bubble_id_key`, `veiculos_verificacao_pkey`
