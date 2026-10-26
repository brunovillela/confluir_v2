<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Pessoal (RH da entidade)

52 tabelas. Diagrama: [er/pessoal.md](../er/pessoal.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [aso](#aso) | **sensível: saúde**, trabalhista | Atestados de Saúde Ocupacional (NR-7) dos funcionários da entidade: data, tipo, vencimento, se foi realizado e enviado, com o arquivo. Grava… |
| [pes_atestados_medicos](#pes_atestados_medicos) | **sensível: saúde**, identificação, trabalhista | Atestado médico de um funcionário da entidade (período, dias, CID, arquivo, acompanhamento de familiar). Migrado do Bubble; gravado na ficha… |
| [pessoal_anuenio](#pessoal_anuenio) | financeiro, trabalhista | Lançamento de anuênio de um funcionário: degrau atual e próximo na tabela de anuênios, com as datas de avanço (automático no aniversário de … |
| [pessoal_anuenio_base](#pessoal_anuenio_base) | — | Tabela de degraus do anuênio: anos de casa (nivel, 0 a 30) e alíquota sobre o salário básico. Espelho do Bubble; cadastrada em Pessoal > Anu… |
| [pessoal_atividade_medidas_seguranca](#pessoal_atividade_medidas_seguranca) | — | Espelho de "Pessoal - Atividade medidas segurança" do Bubble |
| [pessoal_atividades](#pessoal_atividades) | trabalhista | Atividade (atribuição) executada na entidade, base do inventário de SST: descrição, presença e avaliação; filhas guardam executores, ferrame… |
| [pessoal_atividades_executores](#pessoal_atividades_executores) | trabalhista | Quem executa uma atividade (funcionário ou fornecedor), com recorrência e tempo dedicado. Espelho do Bubble; editada em Pessoal > Atribuiçõe… |
| [pessoal_atividades_ferramentas](#pessoal_atividades_ferramentas) | — | Espelho de "Pessoal - Atividades ferramentas" do Bubble |
| [pessoal_atividades_perigos](#pessoal_atividades_perigos) | trabalhista | Perigo identificado numa atividade (fonte, circunstâncias, severidade, norma), base do levantamento de riscos de SST. Espelho do Bubble; edi… |
| [pessoal_atividades_riscos](#pessoal_atividades_riscos) | — | Risco de SST de um perigo/atividade (tipo, lesões possíveis, severidade e probabilidade, inclusive residuais). Herdado do Bubble; editado em… |
| [pessoal_atribuicoes_cargo](#pessoal_atribuicoes_cargo) | — | Espelho de "Pessoal - Atribuições Do Cargo" do Bubble |
| [pessoal_ausencias](#pessoal_ausencias) | **sensível: saúde**, trabalhista | Ausência de um funcionário (período e motivo), ligada ao atestado, às férias ou à falta justificada que a explica. Espelho do Bubble; gravad… |
| [pessoal_cargo](#pessoal_cargo) | — | Cargo do quadro de funcionários, com carga horária padrão e reduzida; eixo da tabela salarial. Espelho do Bubble; só lido em lib/db/carreira… |
| [pessoal_contracheques](#pessoal_contracheques) | financeiro, trabalhista | Contracheque (PDF) de um funcionário numa remessa da folha, com valor líquido e a ordem de pagamento gerada. Migrado do Bubble; enviado em P… |
| [pessoal_contracheques_config](#pessoal_contracheques_config) | — | Configuração por entidade da geração de ordem de pagamento a partir dos contracheques (conta, departamento, forma de pagamento). Gravada em … |
| [pessoal_contracheques_remessas](#pessoal_contracheques_remessas) | — | Espelho de "Pessoal - Contracheques - remessas" do Bubble |
| [pessoal_dependentes](#pessoal_dependentes) | identificação | Dependente de um funcionário (nome, CPF, nascimento, parentesco). Espelho do Bubble; alterações entram no movimento da folha enviado à conta… |
| [pessoal_diarias_centros_custo](#pessoal_diarias_centros_custo) | — | Conta contábil de cada gasto de diária. Busca: (quadro, departamento, tipo) → (quadro, sem departamento, tipo) → nada, e aí a ordem sai sem … |
| [pessoal_diarias_descontos](#pessoal_diarias_descontos) | financeiro | Infração de trânsito abatida de uma diária na aprovação (valor descontado). Gravada em lib/db/diarias. |
| [pessoal_diarias_despesa_tipos](#pessoal_diarias_despesa_tipos) | — | Gastos que podem acompanhar uma diária (hospedagem, alimentação, passagem). Cada um tem conta própria em pessoal_diarias_centros_custo. |
| [pessoal_diarias_despesas](#pessoal_diarias_despesas) | financeiro | Despesa extra (hospedagem, alimentação etc.) de uma diária migrada do Bubble, com custo e comprovante. Só leitura, no histórico de diárias. |
| [pessoal_diarias_lancamentos](#pessoal_diarias_lancamentos) | financeiro, trabalhista | Diária histórica migrada do Bubble: data, atividade, local e valores pagos a um beneficiário. Só leitura, no histórico de diárias. |
| [pessoal_diarias_remessas](#pessoal_diarias_remessas) | financeiro | Remessa mensal de diárias de um beneficiário (funcionário ou diretor): preparação, envio, avaliação, devolução e ordem de pagamento. Parte m… |
| [pessoal_diarias_solicitacao_despesas](#pessoal_diarias_solicitacao_despesas) | financeiro | Despesa extra anexada a uma solicitação de diária (descrição, valor, comprovante). Gravada em lib/db/diarias-despesas. |
| [pessoal_diarias_solicitacoes](#pessoal_diarias_solicitacoes) | financeiro, trabalhista | Solicitação de diária de um funcionário ou diretor (período, motivo, valores, avaliação), que entra na remessa e gera ordem de pagamento. Gr… |
| [pessoal_faltas_config](#pessoal_faltas_config) | — | Regras por entidade das faltas justificadas: limites por ano/mês/semana, tipos de justificativa e exigência de comprovante. Gravada em lib/d… |
| [pessoal_faltas_justificadas](#pessoal_faltas_justificadas) | trabalhista, **sensível: saúde** | Pedido de falta justificada de um funcionário (data, tipo, comprovante, autorização ou recusa). Migrado do Bubble; gravado em Meu perfil e a… |
| [pessoal_faltas_justificadas_periodo](#pessoal_faltas_justificadas_periodo) | — | Espelho de "Pessoal - Faltas justificadas - período" do Bubble |
| [pessoal_ferias](#pessoal_ferias) | trabalhista | Período aquisitivo/concessivo de férias de um funcionário, com dias disponíveis e abono. Espelho do Bubble; lido em Pessoal > Férias (lib/db… |
| [pessoal_ferias_gozo](#pessoal_ferias_gozo) | trabalhista | Gozo de férias solicitado por um funcionário dentro de um período (datas, dias, abono, autorização, aviso). Espelho do Bubble; pedido em Meu… |
| [pessoal_folha_competencias](#pessoal_folha_competencias) | identificação, financeiro, trabalhista | Competências do movimento da folha ENVIADAS à contabilidade, com a fotografia (snapshot) das linhas entregues. Competência sem linha aqui es… |
| [pessoal_folha_config](#pessoal_folha_config) | identificação | Configuração do movimento da folha para a contabilidade, uma linha por entidade (src/lib/db/folha-movimento.ts). |
| [pessoal_funcionario_funcao](#pessoal_funcionario_funcao) | trabalhista | Função (atribuição) exercida por um funcionário. Gravada em Pessoal > Atribuições; alterações entram no movimento da folha. |
| [pessoal_funcionario_jornada](#pessoal_funcionario_jornada) | trabalhista | Jornada de trabalho de um funcionário por dia da semana (hora de início e fim). Gravada em Pessoal > Atribuições; alterações entram no movim… |
| [pessoal_funcoes](#pessoal_funcoes) | — | Catálogo de funções da entidade (nome, descrição) atribuíveis aos funcionários. Gravado em Pessoal > Atribuições. |
| [pessoal_ghe](#pessoal_ghe) | — | Grupo Homogêneo de Exposição (GHE) de SST: funcionários expostos aos mesmos riscos. Gravado em Pessoal > Atribuições. |
| [pessoal_ghe_membros](#pessoal_ghe_membros) | trabalhista | Funcionário integrante de um GHE (grupo de exposição a riscos de SST). Gravado em Pessoal > Atribuições. |
| [pessoal_informes_rendimentos](#pessoal_informes_rendimentos) | financeiro | Informe de rendimentos anual (PDF) de um funcionário numa remessa, liberado para consulta em Meu perfil. Espelho do Bubble; enviado em Pesso… |
| [pessoal_informes_rendimentos_remessas](#pessoal_informes_rendimentos_remessas) | — | Espelho de "Pessoal - Informes de rendimentos - Remessas" do Bubble |
| [pessoal_nivel_salarial](#pessoal_nivel_salarial) | financeiro, trabalhista | Lançamento de nível salarial de um funcionário (nível atual e próximo, tipo de avanço: automático, mérito, ajuste, inicial). Espelho do Bubb… |
| [pessoal_nivel_salarial_base](#pessoal_nivel_salarial_base) | — | Tabela salarial: cargo x nível vertical x horizontal x carreira, com o salário base. Espelho do Bubble; cadastrada em Pessoal > Níveis. |
| [pessoal_plano_saude](#pessoal_plano_saude) | **sensível: saúde**, identificação, trabalhista | Beneficiário do plano de saúde vinculado a um funcionário titular (dependente, aposentado). Espelho do Bubble. Sem uso encontrado no código … |
| [pessoal_ponto_isencoes](#pessoal_ponto_isencoes) | identificação, trabalhista | Isenções de registro de ponto: funcionário, período e justificativa; quem está isento no mês da remessa não aparece como pendente (src/lib/d… |
| [pessoal_ponto_resenhas](#pessoal_ponto_resenhas) | trabalhista, identificação | Resenhas redigidas por IA sobre o controle de ponto (riscos trabalhistas, quem acompanhar), por remessa, ano ou departamento. |
| [pessoal_reembolsos_act](#pessoal_reembolsos_act) | financeiro, **sensível: saúde** | Pedido de reembolso previsto no ACT feito por um funcionário (tipo, valores, comprovante, avaliação, pagamento). Parte migrada do Bubble; gr… |
| [pessoal_reembolsos_act_tipos](#pessoal_reembolsos_act_tipos) | — | Tipos de reembolso previstos no ACT dos funcionários, com teto e proporção reembolsável. Cadastrados em Pessoal > Reembolsos. |
| [pessoal_registro_ponto](#pessoal_registro_ponto) | trabalhista, financeiro | Espelho de ponto mensal (PDF) de um funcionário numa remessa, com saldos de horas extras 70% e 100% e as marcações diárias lidas por IA. Mig… |
| [pessoal_registro_ponto_remessas](#pessoal_registro_ponto_remessas) | — | Remessa mensal de espelhos de ponto (mês de referência, finalizada). Migrada do Bubble; gerida em Pessoal > Ponto. |
| [pessoal_treinamentos](#pessoal_treinamentos) | — | Catálogo de treinamentos (carga horária e validade em meses) usado em SST. Herdado do Bubble; cadastrado em Pessoal > Treinamentos. |
| [pessoal_treinamentos_alunos](#pessoal_treinamentos_alunos) | trabalhista | Participação de um funcionário num treinamento (datas e certificado), usada no controle de vencimentos. Espelho do Bubble; gravada em Pessoa… |
| [prestadores_servico](#prestadores_servico) | identificação | Prestador de serviço pessoa física (CPF, nome) ligado a um fornecedor. Sem uso encontrado no código (possível legado do Bubble). |
| [prestcont_remessa](#prestcont_remessa) | financeiro | Remessa de prestação de contas de um beneficiário (planilha, período, valor total, ordem de pagamento). Sem uso encontrado no código (possív… |

## aso

Atestados de Saúde Ocupacional (NR-7) dos funcionários da entidade: data, tipo, vencimento, se foi realizado e enviado, com o arquivo. Gravada pela área Pessoal (aba Saúde) e usada nos alertas de vencimento; origem Bubble.

- **LGPD:** **sensível: saúde**, trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `data` | date | sim |  |  | **sensível: saúde** |  |
| `tipo` | text | sim |  |  | **sensível: saúde** | Tipo do exame NR-7 (admissional, periódico, demissional etc.). |
| `arquivo` | text | sim |  |  | **sensível: saúde** | Arquivo do ASO, com o parecer de aptidão. |
| `ultimo` | boolean | sim | `false` |  |  | Marca o ASO mais recente do funcionário. |
| `vencimento` | date | sim |  |  | **sensível: saúde** |  |
| `enviado` | boolean | sim | `false` |  |  | Se o ASO já foi enviado ao funcionário/contabilidade. |
| `realizado` | boolean | sim | `false` |  | **sensível: saúde** |  |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `aso_bubble_id_key`, `aso_pkey`

## pes_atestados_medicos

Atestado médico de um funcionário da entidade (período, dias, CID, arquivo, acompanhamento de familiar). Migrado do Bubble; gravado na ficha do funcionário em Pessoal (lib/db/pessoal-saude) e usado para justificar ausências.

- **LGPD:** **sensível: saúde**, identificação, trabalhista · titulares: funcionários; familiares acompanhados (inclusive filhos menores de 6 anos)
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `cid10` | text | sim |  |  | **sensível: saúde** | CID-10 do diagnóstico informado no atestado. |
| `atestado` | text | sim |  |  | **sensível: saúde** | Arquivo (URL) do atestado médico digitalizado. |
| `ano` | anos_enum | sim |  |  |  |  |
| `mes` | meses_enum | sim |  |  |  |  |
| `consideracao` | text | sim |  |  | **sensível: saúde** | Observação livre sobre o atestado. |
| `inicio` | date | sim |  |  | **sensível: saúde** |  |
| `termino` | date | sim |  |  | **sensível: saúde** |  |
| `quantidade_dias` | integer | sim |  |  | **sensível: saúde** | Dias de afastamento. |
| `nome_acompanhado` | text | sim |  |  | **sensível: saúde** | Nome do familiar que o funcionário acompanhou em atendimento de saúde. |
| `filho_menor_6_anos` | boolean | sim | `false` |  | **sensível: saúde** | Acompanhamento de filho menor de 6 anos (dado de criança). |
| `atestado_acompanhamento` | boolean | sim | `false` |  | **sensível: saúde** | Atestado de acompanhamento de familiar, não do próprio funcionário. |
| `pericias_retorno` | text[] | sim |  |  | **sensível: saúde** | Perícias de retorno ao trabalho, herdadas do Bubble. |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `aso_retorno_raw` | jsonb | sim |  |  | **sensível: saúde** | Lista de bubble_ids de ASO - Atestado de Saúde Ocupacional ("ASO de retorno") -- TODO: normalizar (junção N:N) |

Únicas: `UNIQUE (bubble_id)`

Índices: `pes_atestados_medicos_bubble_id_key`, `pes_atestados_medicos_pkey`

## pessoal_anuenio

Lançamento de anuênio de um funcionário: degrau atual e próximo na tabela de anuênios, com as datas de avanço (automático no aniversário de emprego). Espelho do Bubble; gravado em Pessoal > Anuênios (lib/db/carreira).

- **LGPD:** financeiro, trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `ano` | text | sim |  |  |  |  |
| `mes` | text | sim |  |  |  |  |
| `informado_contabilidade` | boolean | sim |  |  |  | Se o avanço já foi comunicado à contabilidade. |
| `id_schedule_proximo_anuenio` | text | sim |  |  |  | Id do agendamento (workflow) do Bubble que fazia o avanço; legado. |
| `nivel_atual_data` | date | sim |  |  | trabalhista | Desde quando vale o degrau atual. |
| `proximo_nivel_data` | date | sim |  |  | trabalhista | Data prevista do próximo avanço (atual + 1 ano). |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `nivel_atual_id` | uuid | sim |  | → pessoal_anuenio_base | financeiro | Degrau atual em pessoal_anuenio_base (define a alíquota sobre o salário). |
| `proximo_nivel_id` | uuid | sim |  | → pessoal_anuenio_base |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_anuenio_bubble_id_key`, `pessoal_anuenio_pkey`

## pessoal_anuenio_base

Tabela de degraus do anuênio: anos de casa (nivel, 0 a 30) e alíquota sobre o salário básico. Espelho do Bubble; cadastrada em Pessoal > Anuênios.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `aliquota` | numeric | sim |  |  |  | Fração do salário básico (ex.: 0.046). |
| `nivel` | numeric | sim |  |  |  | Anos de casa a que o degrau corresponde. |
| `sindicato_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_anuenio_base_bubble_id_key`, `pessoal_anuenio_base_pkey`

## pessoal_atividade_medidas_seguranca

Espelho de "Pessoal - Atividade medidas segurança" do Bubble

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `descricao` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `risco_raw` | jsonb | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `atividade_id` | uuid | sim |  | → pessoal_atividades (**cascade**) |  |  |
| `treinamento_id` | uuid | sim |  | → pessoal_treinamentos (set null) |  |  |
| `recorrencia_meses` | integer | sim |  |  |  | Periodicidade da medida, em meses. |
| `epi_ca` | text | sim |  |  |  | Número do Certificado de Aprovação (CA) do EPI. |
| `risco_id` | uuid | sim |  | → pessoal_atividades_riscos (set null) |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_pessoal_ativ_medidas_ativ`, `pessoal_atividade_medidas_seguranca_bubble_id_key`, `pessoal_atividade_medidas_seguranca_pkey`

## pessoal_atividades

Atividade (atribuição) executada na entidade, base do inventário de SST: descrição, presença e avaliação; filhas guardam executores, ferramentas, perigos e riscos. Espelho do Bubble; editada em Pessoal > Atribuições (lib/db/pessoal-sst).

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `atividade` | text | sim |  |  |  |  |
| `descricao_detalhada` | text | sim |  |  |  |  |
| `funcionarios_raw` | jsonb | sim |  |  | trabalhista | Lista de bubble_ids dos funcionários ligados à atividade (legado). |
| `departamentos_raw` | jsonb | sim |  |  |  |  |
| `executores_raw` | jsonb | sim |  |  | trabalhista | Lista de bubble_ids de executores (legado). |
| `treinamentos_raw` | jsonb | sim |  |  |  |  |
| `ferramentas_raw` | jsonb | sim |  |  |  |  |
| `atribuicoes_relacionadas_raw` | jsonb | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `presenca` | text | sim |  |  |  | Modo de execução (presencial, remoto etc.). |
| `avaliada_em` | date | sim |  |  |  |  |
| `observacoes` | text | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_pessoal_atividades_emp`, `pessoal_atividades_bubble_id_key`, `pessoal_atividades_pkey`

## pessoal_atividades_executores

Quem executa uma atividade (funcionário ou fornecedor), com recorrência e tempo dedicado. Espelho do Bubble; editada em Pessoal > Atribuições.

- **LGPD:** trabalhista · titulares: funcionários; fornecedores PF
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `recorrente` | boolean | sim |  |  |  |  |
| `horas_execucao_semanal` | numeric | sim |  |  | trabalhista |  |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `atividade_id` | uuid | sim |  | → pessoal_atividades (**cascade**) |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `tempo_min_mes` | integer | sim |  |  | trabalhista | Minutos por mês dedicados à atividade. |
| `avaliado_em` | date | sim |  |  |  |  |
| `recorrencia` | text | sim |  |  |  |  |
| `frequencia` | text | sim |  |  |  |  |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_pessoal_ativ_exec_fornecedor`, `idx_pessoal_ativ_exec_func`, `pessoal_atividades_executores_bubble_id_key`, `pessoal_atividades_executores_pkey`, `ux_pessoal_ativ_exec_fornecedor`, `ux_pessoal_ativ_exec_par`

## pessoal_atividades_ferramentas

Espelho de "Pessoal - Atividades ferramentas" do Bubble

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `habilitacao_necessaria` | boolean | sim |  |  |  |  |
| `atividades_id` | uuid | sim |  | → pessoal_atividades |  | FK antiga à atividade, duplicada por atividade_id. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `atividade_id` | uuid | sim |  | → pessoal_atividades (**cascade**) |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_pessoal_ativ_ferr_ativ`, `pessoal_atividades_ferramentas_bubble_id_key`, `pessoal_atividades_ferramentas_pkey`

## pessoal_atividades_perigos

Perigo identificado numa atividade (fonte, circunstâncias, severidade, norma), base do levantamento de riscos de SST. Espelho do Bubble; editada em Pessoal > Atribuições.

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `fonte` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `circunstancias` | text | sim |  |  |  |  |
| `riscos_raw` | jsonb | sim |  |  |  |  |
| `funcionarios_raw` | jsonb | sim |  |  | trabalhista | Lista de bubble_ids dos funcionários expostos ao perigo (legado). |
| `atividade_id` | uuid | sim |  | → pessoal_atividades (**cascade**) |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `severidade` | integer | sim |  |  |  |  |
| `norma` | text | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_pessoal_ativ_perigos_ativ`, `pessoal_atividades_perigos_bubble_id_key`, `pessoal_atividades_perigos_pkey`

## pessoal_atividades_riscos

Risco de SST de um perigo/atividade (tipo, lesões possíveis, severidade e probabilidade, inclusive residuais). Herdado do Bubble; editado em Pessoal > Atribuições (lib/db/pessoal-sst).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `possiveis_lesoes` | text | sim |  |  |  | Lesões possíveis em tese (não de uma pessoa). |
| `severidade` | text | sim |  |  |  |  |
| `probabilidade` | text | sim |  |  |  |  |
| `perigo_id` | uuid | sim |  | → pessoal_atividades_perigos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `medidas_seguranca_raw` | jsonb | sim |  |  |  | Lista de bubble_ids de Pessoal - Atividade medidas segurança -- TODO: normalizar (junção N:N) |
| `atividade_id` | uuid | sim |  | → pessoal_atividades (**cascade**) |  |  |
| `categoria` | text | sim |  |  |  |  |
| `probabilidade_residual` | integer | sim |  |  |  | Probabilidade após as medidas de segurança. |
| `severidade_residual` | integer | sim |  |  |  | Severidade após as medidas de segurança. |
| `observacao` | text | sim |  |  |  |  |
| `executor_id` | uuid | sim |  | → pessoal_atividades_executores (**cascade**) |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_pessoal_ativ_riscos_ativ`, `idx_pessoal_ativ_riscos_exec`, `pessoal_atividades_riscos_bubble_id_key`, `pessoal_atividades_riscos_pkey`

## pessoal_atribuicoes_cargo

Espelho de "Pessoal - Atribuições Do Cargo" do Bubble

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `atribuicao` | text | sim |  |  |  |  |
| `cargo_id` | uuid | sim |  | → pessoal_cargo |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `funcao_id` | uuid | sim |  | → pessoal_funcoes (**cascade**) |  |  |
| `descricao` | text | sim |  |  |  |  |
| `atividade_id` | uuid | sim |  | → pessoal_atividades (set null) |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_pessoal_atrib_cargo_funcao`, `pessoal_atribuicoes_cargo_bubble_id_key`, `pessoal_atribuicoes_cargo_pkey`

## pessoal_ausencias

Ausência de um funcionário (período e motivo), ligada ao atestado, às férias ou à falta justificada que a explica. Espelho do Bubble; gravada em Pessoal (pessoal-saude e faltas) e usada na análise do ponto.

- **LGPD:** **sensível: saúde**, trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `inicio` | date | sim |  |  | trabalhista |  |
| `termino` | date | sim |  |  | trabalhista |  |
| `motivo` | text | sim |  |  | **sensível: saúde** | Motivo da ausência; pode indicar doença (atestado). |
| `periodo_raw` | text | sim |  |  | trabalhista | Intervalo de datas do Bubble em texto. |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `atestado_id` | uuid | sim |  | → pes_atestados_medicos | **sensível: saúde** | Atestado médico que justificou a ausência. |
| `ferias_id` | uuid | sim |  | → pessoal_ferias_gozo |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `observacao` | text | sim |  |  | **sensível: saúde** |  |
| `falta_id` | uuid | sim |  | → pessoal_faltas_justificadas (set null) |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_ausencias_bubble_id_key`, `pessoal_ausencias_pkey`

## pessoal_cargo

Cargo do quadro de funcionários, com carga horária padrão e reduzida; eixo da tabela salarial. Espelho do Bubble; só lido em lib/db/carreira.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `nome` | text | não |  |  |  |  |
| `carga_horaria_padrao` | numeric | sim |  |  |  |  |
| `carga_horaria_reduzida` | numeric | sim |  |  |  |  |
| `sindicato_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_cargo_bubble_id_key`, `pessoal_cargo_pkey`

## pessoal_contracheques

Contracheque (PDF) de um funcionário numa remessa da folha, com valor líquido e a ordem de pagamento gerada. Migrado do Bubble; enviado em Pessoal > Contracheques e liberado ao funcionário em Meu perfil.

- **LGPD:** financeiro, trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `ordem` | integer | sim |  |  |  |  |
| `liberado` | boolean | sim | `false` |  |  | Se o funcionário já pode ver o contracheque. |
| `arquivo` | text | sim |  |  | financeiro | PDF do contracheque. |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `remessa_id` | uuid | sim |  | → pessoal_contracheques_remessas |  |  |
| `valor_liquido` | numeric(14,2) | sim |  |  | financeiro | Valor líquido a pagar ao funcionário — vira o valor da ordem de pagamento. |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento (set null) |  | Ordem de pagamento gerada no registro do contracheque (tipo Folha de pagamento). |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_pessoal_contracheques_ordem`, `pessoal_contracheques_bubble_id_key`, `pessoal_contracheques_pkey`

## pessoal_contracheques_config

Configuração por entidade da geração de ordem de pagamento a partir dos contracheques (conta, departamento, forma de pagamento). Gravada em lib/db/contracheques-ordens.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `gerar_ordem` | boolean | não | `true` |  |  | Se cada contracheque registrado vira ordem de pagamento. |
| `centro_custo_despesa_id` | uuid | sim |  | → centros_de_custo |  |  |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `forma_pagamento` | text | não | `'Depósito bancário (TED)'::text` |  |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `pessoal_contracheques_config_pkey`, `ux_pessoal_contracheques_config_emp`

## pessoal_contracheques_remessas

Espelho de "Pessoal - Contracheques - remessas" do Bubble

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `decimo_terceiro` | boolean | sim |  |  |  |  |
| `ordem` | integer | sim |  |  |  |  |
| `ferias` | boolean | sim |  |  |  |  |
| `finalizada` | boolean | sim |  |  |  |  |
| `adiantamento` | boolean | sim |  |  |  |  |
| `complementar_mensal` | boolean | sim |  |  |  |  |
| `nome_remessa` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `data_pagamento` | date | sim |  |  |  | Dia do pagamento da folha — vencimento das ordens geradas pelos contracheques. |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_contracheques_remessas_bubble_id_key`, `pessoal_contracheques_remessas_pkey`

## pessoal_dependentes

Dependente de um funcionário (nome, CPF, nascimento, parentesco). Espelho do Bubble; alterações entram no movimento da folha enviado à contabilidade.

- **LGPD:** identificação · titulares: dependentes (menores!) de funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `ativo` | boolean | sim |  |  |  |  |
| `nascimento` | date | sim |  |  | identificação |  |
| `nome_completo` | text | sim |  |  | identificação |  |
| `grau_parentesco` | text | sim |  |  | identificação |  |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_dependentes_bubble_id_key`, `pessoal_dependentes_pkey`

## pessoal_diarias_centros_custo

Conta contábil de cada gasto de diária. Busca: (quadro, departamento, tipo) → (quadro, sem departamento, tipo) → nada, e aí a ordem sai sem conta para o financeiro classificar.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `quadro` | text | não |  |  |  | funcionario \| diretor \| convidado (convidado de evento — só passagem e hospedagem, via Viagens). |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `despesa_tipo_id` | uuid | sim |  | → pessoal_diarias_despesa_tipos (**cascade**) |  |  |
| `centro_custo_id` | uuid | não |  | → centros_de_custo |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `pessoal_diarias_centros_custo_quadro_check` `CHECK ((quadro = ANY (ARRAY['funcionario'::text, 'diretor'::text, 'convidado'::text])))`

Índices: `pessoal_diarias_centros_custo_pkey`, `ux_diarias_centros_custo_chave`

## pessoal_diarias_descontos

Infração de trânsito abatida de uma diária na aprovação (valor descontado). Gravada em lib/db/diarias.

- **LGPD:** financeiro · titulares: funcionários; diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `diaria_solicitacao_id` | uuid | não |  | → pessoal_diarias_solicitacoes (**cascade**) |  |  |
| `infracao_id` | uuid | não |  | → veiculos_infracoes | financeiro | Multa de trânsito atribuída ao beneficiário. |
| `valor` | numeric | não |  |  | financeiro |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `pessoal_diarias_descontos_infracao_idx`, `pessoal_diarias_descontos_pkey`, `pessoal_diarias_descontos_solic_idx`

## pessoal_diarias_despesa_tipos

Gastos que podem acompanhar uma diária (hospedagem, alimentação, passagem). Cada um tem conta própria em pessoal_diarias_centros_custo.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | não |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `exige_comprovante` | boolean | não | `true` |  |  |  |
| `ativa` | boolean | não | `true` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `pessoal_diarias_despesa_tipos_pkey`, `ux_diarias_despesa_tipos_nome`

## pessoal_diarias_despesas

Despesa extra (hospedagem, alimentação etc.) de uma diária migrada do Bubble, com custo e comprovante. Só leitura, no histórico de diárias.

- **LGPD:** financeiro · titulares: funcionários; diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `lancamento_id` | uuid | sim |  | → pessoal_diarias_lancamentos (**cascade**) |  |  |
| `beneficiario_id` | uuid | sim |  | → usuarios |  |  |
| `tipo_despesa` | text | sim |  |  |  |  |
| `custo` | numeric(14,2) | sim |  |  | financeiro |  |
| `comprovante` | text | sim |  |  | financeiro | Arquivo do comprovante da despesa. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_pessoal_diarias_despesas_lancamento`, `pessoal_diarias_despesas_pkey`, `ux_pessoal_diarias_despesas_bubble`

## pessoal_diarias_lancamentos

Diária histórica migrada do Bubble: data, atividade, local e valores pagos a um beneficiário. Só leitura, no histórico de diárias.

- **LGPD:** financeiro, trabalhista · titulares: funcionários; diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `remessa_id` | uuid | sim |  | → pessoal_diarias_remessas (**cascade**) |  |  |
| `beneficiario_id` | uuid | sim |  | → usuarios |  |  |
| `tipo_id` | uuid | sim |  | → financeiro_diarias |  |  |
| `data` | date | sim |  |  |  |  |
| `atividade` | text | sim |  |  | trabalhista |  |
| `local` | text | sim |  |  | trabalhista | Local da viagem/atividade. |
| `valor_diaria` | numeric(14,2) | sim |  |  | financeiro |  |
| `valor_despesas` | numeric(14,2) | sim |  |  | financeiro |  |
| `valor_total` | numeric(14,2) | sim |  |  | financeiro |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `idx_pessoal_diarias_lancamentos_emp`, `idx_pessoal_diarias_lancamentos_remessa`, `pessoal_diarias_lancamentos_pkey`, `ux_pessoal_diarias_lancamentos_bubble`

## pessoal_diarias_remessas

Remessa mensal de diárias de um beneficiário (funcionário ou diretor): preparação, envio, avaliação, devolução e ordem de pagamento. Parte migrada do Bubble; fluxo em lib/db/diarias-remessas.

- **LGPD:** financeiro · titulares: funcionários; diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `beneficiario_id` | uuid | sim |  | → usuarios |  |  |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `inicio` | date | sim |  |  |  |  |
| `termino` | date | sim |  |  |  |  |
| `ano` | integer | sim |  |  |  |  |
| `mes` | text | sim |  |  |  |  |
| `valor_total` | numeric(14,2) | sim |  |  | financeiro |  |
| `enviado` | boolean | sim |  |  |  |  |
| `avaliacao_aprovado` | boolean | sim |  |  |  |  |
| `avaliacao_data` | timestamp with time zone | sim |  |  |  |  |
| `avaliacao_observacao` | text | sim |  |  | financeiro |  |
| `avaliador_id` | uuid | sim |  | → usuarios |  |  |
| `forma_pagamento` | text | sim |  |  | financeiro |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento (set null) |  |  |
| `pagamento_pago` | boolean | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `beneficiario_tipo` | text | sim |  |  |  | Quadro da remessa (funcionario \| diretor) — decide a porta (Pessoal ou Diretoria). Nulo nas migradas do sistema anterior. |
| `enviado_em` | timestamp with time zone | sim |  |  |  |  |
| `enviado_por` | uuid | sim |  | → usuarios |  |  |
| `situacao` | text | não | `'aberta'::text` |  |  | preparacao (a pessoa junta as diárias) \| aberta (enviada, em avaliação) \| devolvida \| reenviada \| aprovada (ordem gerada). |
| `devolucao_observacao` | text | sim |  |  | financeiro |  |
| `devolvida_em` | timestamp with time zone | sim |  |  |  |  |
| `devolvida_por` | uuid | sim |  | → usuarios |  |  |
| `reenviada_em` | timestamp with time zone | sim |  |  |  |  |
| `historico` | jsonb | não | `'[]'::jsonb` |  | financeiro | Passos da avaliação: [{em, por, acao: devolvida\|reenviada\|aprovada, observacao, pendencias:[{diariaId, observacao}]}]. |
| `enviada_avaliacao_em` | timestamp with time zone | sim |  |  |  |  |
| `enviada_avaliacao_por` | uuid | sim |  | → usuarios |  |  |
| `lembrete_em` | timestamp with time zone | sim |  |  |  | Último lembrete de remessa em preparação (um por semana, a partir de 7 dias da primeira diária). |

Checks: `pessoal_diarias_remessas_situacao_chk` `CHECK ((situacao = ANY (ARRAY['preparacao'::text, 'aberta'::text, 'devolvida'::text, 'reenviada'::text, 'aprovada'::text])))`

Índices: `idx_diarias_remessas_abertas`, `idx_diarias_remessas_situacao`, `idx_pessoal_diarias_remessas_benef`, `idx_pessoal_diarias_remessas_emp`, `pessoal_diarias_remessas_pkey`, `ux_pessoal_diarias_remessas_bubble`

## pessoal_diarias_solicitacao_despesas

Despesa extra anexada a uma solicitação de diária (descrição, valor, comprovante). Gravada em lib/db/diarias-despesas.

- **LGPD:** financeiro · titulares: funcionários; diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `solicitacao_id` | uuid | não |  | → pessoal_diarias_solicitacoes (**cascade**) |  |  |
| `tipo_id` | uuid | sim |  | → pessoal_diarias_despesa_tipos |  |  |
| `descricao` | text | sim |  |  | financeiro |  |
| `valor` | numeric | não |  |  | financeiro |  |
| `comprovante` | text | sim |  |  | financeiro | Arquivo do comprovante. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `pessoal_diarias_solicitacao_despesas_valor_check` `CHECK ((valor > (0)::numeric))`

Índices: `idx_diarias_solic_despesas_solicitacao`, `pessoal_diarias_solicitacao_despesas_pkey`

## pessoal_diarias_solicitacoes

Solicitação de diária de um funcionário ou diretor (período, motivo, valores, avaliação), que entra na remessa e gera ordem de pagamento. Gravada em lib/db/diarias.

- **LGPD:** financeiro, trabalhista · titulares: funcionários; diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `funcionario_id` | uuid | não |  | → usuarios |  |  |
| `diaria_id` | uuid | não |  | → financeiro_diarias |  |  |
| `quantidade` | numeric | não | `1` |  |  |  |
| `motivo` | text | não |  |  | trabalhista | Atividade/viagem que justifica a diária. |
| `data_inicio` | date | sim |  |  |  |  |
| `data_termino` | date | sim |  |  |  |  |
| `situacao` | text | não | `'aguardando'::text` |  |  |  |
| `valor_unitario` | numeric | sim |  |  | financeiro |  |
| `valor_total` | numeric | sim |  |  | financeiro |  |
| `avaliador_id` | uuid | sim |  | → usuarios |  |  |
| `avaliacao_data` | timestamp with time zone | sim |  |  |  |  |
| `avaliacao_observacao` | text | sim |  |  | financeiro |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `beneficiario_tipo` | text | não | `'funcionario'::text` |  |  | Em que condição a pessoa recebe: funcionario (Pessoal) ou diretor (Diretoria). Decide a conta e quem avalia. |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  | Departamento que banca a atividade — dá a conta contábil da diária de diretor. |
| `solicitante_id` | uuid | sim |  | → usuarios |  | Quem lançou, quando não foi o próprio beneficiário (a secretaria lança pelo diretor sem conta). |
| `valor_despesas` | numeric | sim |  |  | financeiro | Soma das despesas extras aprovadas; valor_total continua sendo só a diária. |
| `remessa_id` | uuid | sim |  | → pessoal_diarias_remessas |  | Remessa do beneficiário em que a diária entrou ao ser lançada. |
| `valor_descontos` | numeric(12,2) | sim |  |  | financeiro | Infrações de trânsito abatidas na aprovação (a diária entra líquida na remessa). |
| `pendencia_observacao` | text | sim |  |  |  | Não conformidade apontada pelo avaliador na última devolução da remessa. |
| `complemento_de` | uuid | sim |  | → pessoal_diarias_solicitacoes |  | Diária já recebida de que esta solicitação é complemento: só despesas lançadas depois da viagem (valor da diária zero). |

Checks: `pessoal_diarias_solicitacoes_beneficiario_tipo_check` `CHECK ((beneficiario_tipo = ANY (ARRAY['funcionario'::text, 'diretor'::text])))`; `pessoal_diarias_solicitacoes_quantidade_check` `CHECK ((quantidade > (0)::numeric))`; `pessoal_diarias_solicitacoes_situacao_check` `CHECK ((situacao = ANY (ARRAY['aguardando'::text, 'aprovada'::text, 'reprovada'::text, 'cancelada'::text])))`

Índices: `idx_diarias_solicitacoes_complemento`, `idx_diarias_solicitacoes_departamento`, `idx_diarias_solicitacoes_funcionario`, `idx_diarias_solicitacoes_remessa`, `idx_diarias_solicitacoes_situacao`, `idx_diarias_solicitacoes_tipo_benef`, `pessoal_diarias_solicitacoes_pkey`

## pessoal_faltas_config

Regras por entidade das faltas justificadas: limites por ano/mês/semana, tipos de justificativa e exigência de comprovante. Gravada em lib/db/faltas.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `limite_ano` | integer | sim |  |  |  |  |
| `limite_mes` | integer | sim |  |  |  |  |
| `limite_semana` | integer | sim |  |  |  |  |
| `tipos` | text[] | sim |  |  |  | Tipos de justificativa oferecidos no pedido. |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `atualizado_por_id` | uuid | sim |  | → usuarios |  |  |
| `exige_comprovacao` | boolean | não | `false` |  |  |  |
| `trava_sem_comprovacao` | boolean | não | `false` |  |  | Impede autorizar falta sem comprovante. |

Checks: `pessoal_faltas_config_limite_ano_check` `CHECK (((limite_ano IS NULL) OR (limite_ano >= 0)))`; `pessoal_faltas_config_limite_mes_check` `CHECK (((limite_mes IS NULL) OR (limite_mes >= 0)))`; `pessoal_faltas_config_limite_semana_check` `CHECK (((limite_semana IS NULL) OR (limite_semana >= 0)))`

Índices: `pessoal_faltas_config_pkey`, `ux_pessoal_faltas_config_emp`

## pessoal_faltas_justificadas

Pedido de falta justificada de um funcionário (data, tipo, comprovante, autorização ou recusa). Migrado do Bubble; gravado em Meu perfil e avaliado em Pessoal (lib/db/faltas).

- **LGPD:** trabalhista, **sensível: saúde** · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `falta_numero` | integer | sim |  |  |  | Número sequencial da falta no período. |
| `solicitacao_numero` | integer | sim |  |  |  |  |
| `data_falta` | date | sim |  |  | trabalhista |  |
| `data_autorizacao` | date | sim |  |  |  |  |
| `justificativa_tipo` | text | sim |  |  | trabalhista |  |
| `comprovacao` | text | sim |  |  | **sensível: saúde** | Arquivo comprovante; pode ser documento médico. |
| `autorizado` | boolean | sim | `false` |  |  |  |
| `ano` | text | sim |  |  |  |  |
| `mes` | text | sim |  |  |  |  |
| `autorizador_id` | uuid | sim |  | → usuarios |  |  |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `periodo_id` | uuid | sim |  | → pessoal_faltas_justificadas_periodo |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `recusado` | boolean | não | `false` |  |  |  |
| `motivo_recusa` | text | sim |  |  | trabalhista |  |
| `observacao` | text | sim |  |  | trabalhista |  |
| `solicitado_por_id` | uuid | sim |  | → usuarios |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_faltas_justificadas_funcionario_data`, `pessoal_faltas_justificadas_bubble_id_key`, `pessoal_faltas_justificadas_pkey`

## pessoal_faltas_justificadas_periodo

Espelho de "Pessoal - Faltas justificadas - período" do Bubble

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `act_inicio_fim` | text | sim |  |  |  | Campo "ACT (início - fim)" -- relação reversa FALTAS JUSTIFICADAS (list) não migrada como coluna; FK fica em pessoal_faltas_justificadas.periodo_id |
| `finalizado` | boolean | sim |  |  |  |  |
| `inicio_vigencia` | date | sim |  |  |  |  |
| `termino_vigencia` | date | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_faltas_justificadas_periodo_bubble_id_key`, `pessoal_faltas_justificadas_periodo_pkey`

## pessoal_ferias

Período aquisitivo/concessivo de férias de um funcionário, com dias disponíveis e abono. Espelho do Bubble; lido em Pessoal > Férias (lib/db/ferias).

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `concessivo_inicio` | date | sim |  |  | trabalhista |  |
| `concessivo_termino` | date | sim |  |  | trabalhista |  |
| `aquisitivo_inicio` | date | sim |  |  | trabalhista |  |
| `aquisitivo_termino` | date | sim |  |  | trabalhista |  |
| `finalizado` | boolean | sim |  |  |  |  |
| `dias_disponiveis` | numeric | sim |  |  | trabalhista |  |
| `abono_pecuniario` | boolean | sim |  |  | trabalhista |  |
| `trabalhador_id` | uuid | sim |  | → usuarios |  | Funcionário dono do período. |
| `empregador_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_ferias_bubble_id_key`, `pessoal_ferias_pkey`

## pessoal_ferias_gozo

Gozo de férias solicitado por um funcionário dentro de um período (datas, dias, abono, autorização, aviso). Espelho do Bubble; pedido em Meu perfil e autorizado em Pessoal > Férias.

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `dias` | numeric | sim |  |  | trabalhista |  |
| `inicio` | date | sim |  |  | trabalhista |  |
| `termino` | date | sim |  |  | trabalhista |  |
| `ano` | text | sim |  |  |  |  |
| `mes` | text | sim |  |  |  |  |
| `autorizado` | boolean | sim |  |  |  |  |
| `aviso_ferias_url` | text | sim |  |  | trabalhista | URL do arquivo no Bubble CDN -- TODO: migrar para Supabase Storage |
| `periodo_gozo_raw` | text | sim |  |  |  | Campo date_range do Bubble armazenado como texto -- TODO: normalizar |
| `data_autorizacao` | date | sim |  |  |  |  |
| `autorizador_observacoes` | text | sim |  |  | trabalhista |  |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `autorizador_id` | uuid | sim |  | → usuarios |  |  |
| `empregador_id` | uuid | sim |  | → empresa |  |  |
| `ferias_periodo_id` | uuid | sim |  | → pessoal_ferias |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `abono_solicitado` | boolean | não | `false` |  | trabalhista |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_ferias_gozo_bubble_id_key`, `pessoal_ferias_gozo_pkey`

## pessoal_folha_competencias

Competências do movimento da folha ENVIADAS à contabilidade, com a fotografia (snapshot) das linhas entregues. Competência sem linha aqui está aberta.

- **LGPD:** identificação, financeiro, trabalhista · titulares: funcionários; dependentes
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `competencia` | text | não |  |  |  |  |
| `situacao` | text | não | `'enviada'::text` |  |  |  |
| `enviada_em` | timestamp with time zone | não | `now()` |  |  |  |
| `enviada_por` | uuid | sim |  | → usuarios |  |  |
| `observacao` | text | sim |  |  | trabalhista |  |
| `snapshot` | jsonb | não | `'[]'::jsonb` |  | financeiro | Linhas do movimento enviadas à contabilidade, com nome, CPF, matrícula, descrição e valor por funcionário. |
| `total_itens` | integer | não | `0` |  |  |  |
| `recebida_em` | timestamp with time zone | sim |  |  |  |  |
| `recebida_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, competencia)`

Checks: `pessoal_folha_competencias_competencia_check` `CHECK ((competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'::text))`; `pessoal_folha_competencias_situacao_check` `CHECK ((situacao = 'enviada'::text))`

Índices: `pessoal_folha_competencias_emp_proprietaria_id_competencia_key`, `pessoal_folha_competencias_pkey`

## pessoal_folha_config

Configuração do movimento da folha para a contabilidade, uma linha por entidade (src/lib/db/folha-movimento.ts).

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `emp_proprietaria_id` | uuid | não |  | → empresa |  | Entidade (tenant). |
| `marco_inicial` | timestamp with time zone | sim |  |  |  | Marco inicial do movimento: o que foi registrado até este momento conta como enviado à contabilidade e pago; competências enviadas antes dele são desconsideradas. |
| `marco_observacao` | text | sim |  |  |  | Por que o marco foi definido. |
| `marco_definido_por` | uuid | sim |  | → usuarios | identificação | Quem definiu o marco. |
| `marco_definido_em` | timestamp with time zone | sim |  |  |  | Quando o marco foi definido. |
| `created_at` | timestamp with time zone | não | `now()` |  |  | Criação do registro. |
| `he_faixa1_percentual` | numeric(5,2) | não | `50` |  |  | Percentual da faixa 1 de hora extra (colunas *_70 de pessoal_registro_ponto); padrão 50%, o mínimo da CLT. |
| `he_faixa2_percentual` | numeric(5,2) | não | `100` |  |  | Percentual da faixa 2 de hora extra (colunas *_100 de pessoal_registro_ponto: domingos, feriados e folgas); padrão 100%. |

Índices: `pessoal_folha_config_pkey`

## pessoal_funcionario_funcao

Função (atribuição) exercida por um funcionário. Gravada em Pessoal > Atribuições; alterações entram no movimento da folha.

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `funcao_id` | uuid | sim |  | → pessoal_funcoes (**cascade**) |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_pessoal_func_funcao_funcao`, `pessoal_funcionario_funcao_pkey`, `ux_pessoal_func_funcao_pessoa`

## pessoal_funcionario_jornada

Jornada de trabalho de um funcionário por dia da semana (hora de início e fim). Gravada em Pessoal > Atribuições; alterações entram no movimento da folha.

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `dia_semana` | smallint | sim |  |  | trabalhista |  |
| `hora_inicio` | time without time zone | sim |  |  | trabalhista |  |
| `hora_fim` | time without time zone | sim |  |  | trabalhista |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `idx_pessoal_jornada_func`, `pessoal_funcionario_jornada_pkey`, `ux_pessoal_jornada_dia`

## pessoal_funcoes

Catálogo de funções da entidade (nome, descrição) atribuíveis aos funcionários. Gravado em Pessoal > Atribuições.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `idx_pessoal_funcoes_emp`, `pessoal_funcoes_pkey`

## pessoal_ghe

Grupo Homogêneo de Exposição (GHE) de SST: funcionários expostos aos mesmos riscos. Gravado em Pessoal > Atribuições.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `idx_pessoal_ghe_emp`, `pessoal_ghe_pkey`

## pessoal_ghe_membros

Funcionário integrante de um GHE (grupo de exposição a riscos de SST). Gravado em Pessoal > Atribuições.

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `ghe_id` | uuid | sim |  | → pessoal_ghe (**cascade**) |  |  |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_pessoal_ghe_membros_func`, `pessoal_ghe_membros_pkey`, `ux_pessoal_ghe_membro`

## pessoal_informes_rendimentos

Informe de rendimentos anual (PDF) de um funcionário numa remessa, liberado para consulta em Meu perfil. Espelho do Bubble; enviado em Pessoal > Informes.

- **LGPD:** financeiro · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `arquivo_url` | text | sim |  |  | financeiro | URL do arquivo no Bubble CDN -- TODO: migrar para Supabase Storage |
| `ordem` | integer | sim |  |  |  |  |
| `liberado` | boolean | sim |  |  |  |  |
| `ano_referencia_os` | text | sim |  |  |  | Ano de referência em texto (option set do Bubble). |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `remessa_id` | uuid | sim |  | → pessoal_informes_rendimentos_remessas |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_informes_rendimentos_bubble_id_key`, `pessoal_informes_rendimentos_pkey`

## pessoal_informes_rendimentos_remessas

Espelho de "Pessoal - Informes de rendimentos - Remessas" do Bubble

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `ordem` | integer | sim |  |  |  |  |
| `fechada` | boolean | sim |  |  |  |  |
| `ano_referencia` | date | sim |  |  |  |  |
| `ano_referencia_os` | text | sim |  |  |  | Ano de referência em texto (option set do Bubble). |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_informes_rendimentos_remessas_bubble_id_key`, `pessoal_informes_rendimentos_remessas_pkey`

## pessoal_nivel_salarial

Lançamento de nível salarial de um funcionário (nível atual e próximo, tipo de avanço: automático, mérito, ajuste, inicial). Espelho do Bubble; gravado em Pessoal > Níveis (lib/db/carreira).

- **LGPD:** financeiro, trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `ano` | text | sim |  |  |  |  |
| `mes` | text | sim |  |  |  |  |
| `proximo_nivel_texto` | text | sim |  |  | trabalhista |  |
| `tipo_avanco` | text | sim |  |  | trabalhista |  |
| `proximo_nivel_data` | date | sim |  |  | trabalhista |  |
| `nivel_atual_data` | date | sim |  |  | trabalhista |  |
| `id_schedule_proximo_nivel` | text | sim |  |  |  | Id do agendamento do Bubble que fazia o avanço; legado. |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `nivel_atual_id` | uuid | sim |  | → pessoal_nivel_salarial_base | financeiro | Degrau em pessoal_nivel_salarial_base (dá o salário base). |
| `proximo_nivel_id` | uuid | sim |  | → pessoal_nivel_salarial_base |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_nivel_salarial_bubble_id_key`, `pessoal_nivel_salarial_pkey`

## pessoal_nivel_salarial_base

Tabela salarial: cargo x nível vertical x horizontal x carreira, com o salário base. Espelho do Bubble; cadastrada em Pessoal > Níveis.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `ordem` | integer | sim |  |  |  |  |
| `nivel_vertical` | text | sim |  |  |  | Faixa vertical da tabela (ex.: 428). |
| `salario_base` | numeric | sim |  |  |  |  |
| `nivel_horizontal` | text | sim |  |  |  | Letra horizontal (A, B). |
| `nivel_carreira` | text | sim |  |  |  | Júnior, Pleno ou Sênior. |
| `cargo_id` | uuid | sim |  | → pessoal_cargo |  |  |
| `sindicato_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_nivel_salarial_base_bubble_id_key`, `pessoal_nivel_salarial_base_pkey`

## pessoal_plano_saude

Beneficiário do plano de saúde vinculado a um funcionário titular (dependente, aposentado). Espelho do Bubble. Sem uso encontrado no código (possível legado do Bubble).

- **LGPD:** **sensível: saúde**, identificação, trabalhista · titulares: funcionários; dependentes (menores!)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `aposentado` | boolean | não | `false` |  | trabalhista |  |
| `nome_beneficiario` | text | sim |  |  | identificação |  |
| `situacao_dependente` | text | sim |  |  | **sensível: saúde** | Situação do dependente no plano de saúde. |
| `titular_id` | uuid | não |  | → usuarios |  |  |
| `dependente_id` | uuid | sim |  | → pessoal_dependentes |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_plano_saude_bubble_id_key`, `pessoal_plano_saude_pkey`

## pessoal_ponto_isencoes

Isenções de registro de ponto: funcionário, período e justificativa; quem está isento no mês da remessa não aparece como pendente (src/lib/db/ponto-isencoes.ts).

- **LGPD:** identificação, trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  | Identificador da isenção. |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  | Entidade (tenant). |
| `funcionario_id` | uuid | não |  | → usuarios | identificação | Funcionário isento (usuarios.id). |
| `inicio` | date | não |  |  |  | Primeiro dia da isenção. |
| `fim` | date | sim |  |  |  | Último dia da isenção; vazio = sem prazo definido. |
| `justificativa` | text | não |  |  | trabalhista | Por que o funcionário não registra ponto no período. |
| `registrado_por` | uuid | sim |  | → usuarios | identificação | Quem registrou a isenção. |
| `encerrado_por` | uuid | sim |  | → usuarios | identificação | Quem encerrou a isenção (preencheu o fim). |
| `encerrado_em` | timestamp with time zone | sim |  |  |  | Quando a isenção foi encerrada. |
| `created_at` | timestamp with time zone | não | `now()` |  |  | Criação do registro. |

Checks: `pessoal_ponto_isencoes_justificativa` `CHECK ((length(btrim(justificativa)) > 0))`; `pessoal_ponto_isencoes_periodo` `CHECK (((fim IS NULL) OR (fim >= inicio)))`

Índices: `pessoal_ponto_isencoes_funcionario_idx`, `pessoal_ponto_isencoes_pkey`

## pessoal_ponto_resenhas

Resenhas redigidas por IA sobre o controle de ponto (riscos trabalhistas, quem acompanhar), por remessa, ano ou departamento.

- **LGPD:** trabalhista, identificação · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `escopo` | text | não |  |  |  | remessa, ano ou departamento. |
| `chave` | text | não |  |  |  | Identificador do recorte dentro do escopo. |
| `conteudo` | jsonb | não |  |  | trabalhista | Texto da IA; cita funcionários a acompanhar e riscos trabalhistas. |
| `indicadores` | jsonb | sim |  |  | trabalhista | Indicadores enviados à IA, incluindo até 30 pessoas por nome com horas extras e ocorrências. |
| `modelo` | text | sim |  |  |  |  |
| `gerada_em` | timestamp with time zone | não | `now()` |  |  |  |
| `gerada_por` | uuid | sim |  | → usuarios |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, escopo, chave)`

Checks: `pessoal_ponto_resenhas_escopo_check` `CHECK ((escopo = ANY (ARRAY['remessa'::text, 'ano'::text, 'departamento'::text])))`

Índices: `pessoal_ponto_resenhas_emp_proprietaria_id_escopo_chave_key`, `pessoal_ponto_resenhas_pkey`

## pessoal_reembolsos_act

Pedido de reembolso previsto no ACT feito por um funcionário (tipo, valores, comprovante, avaliação, pagamento). Parte migrada do Bubble; gravado em Meu perfil e avaliado em Pessoal > Reembolsos (lib/db/reembolsos).

- **LGPD:** financeiro, **sensível: saúde** · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `funcionario_id` | uuid | não |  | → usuarios |  |  |
| `tipo_id` | uuid | não |  | → pessoal_reembolsos_act_tipos |  |  |
| `valor_solicitado` | numeric | não |  |  | financeiro |  |
| `valor_aprovado` | numeric | sim |  |  | financeiro |  |
| `descricao` | text | não |  |  | **sensível: saúde** | Texto livre; tipos de reembolso do ACT podem ser de saúde (medicamento, ótica etc.). |
| `comprovante_url` | text | sim |  |  | **sensível: saúde** | Nota/recibo; pode ser de despesa médica. |
| `situacao` | text | não | `'aguardando'::text` |  |  |  |
| `avaliador_id` | uuid | sim |  | → usuarios |  |  |
| `avaliacao_data` | timestamp with time zone | sim |  |  |  |  |
| `avaliacao_observacao` | text | sim |  |  | financeiro |  |
| `pagamento_mes` | text | sim |  |  |  |  |
| `pagamento_ano` | text | sim |  |  |  |  |
| `pago_em` | date | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `despesa_paga_em` | date | sim |  |  |  | Quando o funcionário pagou a despesa (o pagamento pela entidade é pago_em). |

Checks: `pessoal_reembolsos_act_situacao_check` `CHECK ((situacao = ANY (ARRAY['aguardando'::text, 'aprovado'::text, 'reprovado'::text, 'cancelado'::text, 'pago'::text])))`; `pessoal_reembolsos_act_valor_aprovado_check` `CHECK (((valor_aprovado IS NULL) OR (valor_aprovado > (0)::numeric)))`; `pessoal_reembolsos_act_valor_solicitado_check` `CHECK ((valor_solicitado > (0)::numeric))`

Índices: `idx_reembolsos_act_funcionario`, `idx_reembolsos_act_situacao`, `pessoal_reembolsos_act_pkey`, `ux_reembolsos_act_bubble`

## pessoal_reembolsos_act_tipos

Tipos de reembolso previstos no ACT dos funcionários, com teto e proporção reembolsável. Cadastrados em Pessoal > Reembolsos.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | não |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `valor_limite` | numeric | sim |  |  |  |  |
| `ativa` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `proporcao_reembolsavel` | numeric | sim |  |  |  | Parte da despesa que o ACT reembolsa (0,5 = 50%). O teto fica em valor_limite. |
| `icone_url` | text | sim |  |  |  |  |

Checks: `pessoal_reembolsos_act_tipos_proporcao_reembolsavel_check` `CHECK (((proporcao_reembolsavel IS NULL) OR ((proporcao_reembolsavel > (0)::numeric) AND (proporcao_reembolsavel <= (1)::numeric))))`; `pessoal_reembolsos_act_tipos_valor_limite_check` `CHECK (((valor_limite IS NULL) OR (valor_limite > (0)::numeric)))`

Índices: `pessoal_reembolsos_act_tipos_pkey`, `ux_reembolsos_act_tipos_bubble`

## pessoal_registro_ponto

Espelho de ponto mensal (PDF) de um funcionário numa remessa, com saldos de horas extras 70% e 100% e as marcações diárias lidas por IA. Migrado do Bubble; enviado em Pessoal > Ponto.

- **LGPD:** trabalhista, financeiro · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `ordem` | integer | sim |  |  |  |  |
| `horas_realizadas_70` | numeric(8,2) | sim |  |  | trabalhista |  |
| `horas_pagas_70` | numeric(8,2) | sim |  |  | financeiro |  |
| `saldo_remanescente_70` | numeric(8,2) | sim |  |  | trabalhista |  |
| `saldo_remessa_anterior_70` | numeric(8,2) | sim |  |  | trabalhista |  |
| `horas_realizadas_100` | numeric(8,2) | sim |  |  | trabalhista |  |
| `horas_pagas_100` | numeric(8,2) | sim |  |  | financeiro |  |
| `saldo_remanescente_100` | numeric(8,2) | sim |  |  | trabalhista |  |
| `saldo_remessa_anterior_100` | numeric(8,2) | sim |  |  | trabalhista |  |
| `liberado` | boolean | sim | `false` |  |  |  |
| `arquivo` | text | sim |  |  | trabalhista | PDF do espelho de ponto. |
| `funcionario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `remessa_id` | uuid | sim |  | → pessoal_registro_ponto_remessas |  |  |
| `marcacoes` | jsonb | sim |  |  | trabalhista | Marcações diárias lidas do espelho pela IA: { departamento, carga_diaria, dias: [{ data, ocorrencia, marcacoes[] }] }. |
| `marcacoes_lidas_em` | timestamp with time zone | sim |  |  |  |  |
| `marcacoes_erro` | text | sim |  |  |  | Erro da leitura por IA, quando houver. |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_registro_ponto_bubble_id_key`, `pessoal_registro_ponto_pkey`

## pessoal_registro_ponto_remessas

Remessa mensal de espelhos de ponto (mês de referência, finalizada). Migrada do Bubble; gerida em Pessoal > Ponto.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `ordem` | integer | sim |  |  |  |  |
| `nome_remessa` | text | sim |  |  |  |  |
| `mes_referencia` | text | sim |  |  |  |  |
| `mes_referencia_os` | text | sim |  |  |  | Mês em texto (option set do Bubble). |
| `ano_referencia_os` | text | sim |  |  |  | Ano em texto (option set do Bubble). |
| `finalizada` | boolean | sim | `false` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_registro_ponto_remessas_bubble_id_key`, `pessoal_registro_ponto_remessas_pkey`

## pessoal_treinamentos

Catálogo de treinamentos (carga horária e validade em meses) usado em SST. Herdado do Bubble; cadastrado em Pessoal > Treinamentos.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `treinamento` | text | sim |  |  |  |  |
| `carga_horaria` | numeric(6,1) | sim |  |  |  |  |
| `vencimento_meses` | integer | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_treinamentos_bubble_id_key`, `pessoal_treinamentos_pkey`

## pessoal_treinamentos_alunos

Participação de um funcionário num treinamento (datas e certificado), usada no controle de vencimentos. Espelho do Bubble; gravada em Pessoal > Treinamentos.

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `data_inicio` | date | sim |  |  | trabalhista |  |
| `data_termino` | date | sim |  |  | trabalhista |  |
| `certificado_url` | text | sim |  |  | trabalhista | URL do arquivo no Bubble CDN -- TODO: migrar para Supabase Storage |
| `aluno_id` | uuid | sim |  | → usuarios |  |  |
| `treinamento_id` | uuid | sim |  | → pessoal_treinamentos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `pessoal_treinamentos_alunos_bubble_id_key`, `pessoal_treinamentos_alunos_pkey`

## prestadores_servico

Prestador de serviço pessoa física (CPF, nome) ligado a um fornecedor. Sem uso encontrado no código (possível legado do Bubble).

- **LGPD:** identificação · titulares: fornecedores PF
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nome_completo` | text | sim |  |  | identificação |  |
| `nome_fantasia` | text | sim |  |  | identificação |  |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `prestadores_servico_bubble_id_key`, `prestadores_servico_pkey`

## prestcont_remessa

Remessa de prestação de contas de um beneficiário (planilha, período, valor total, ordem de pagamento). Sem uso encontrado no código (possível legado do Bubble).

- **LGPD:** financeiro · titulares: funcionários; diretores
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `planilha` | text | sim |  |  | financeiro | Arquivo da planilha de prestação de contas. |
| `valor_total` | numeric(15,2) | sim |  |  | financeiro |  |
| `periodo_inicio` | date | sim |  |  |  |  |
| `periodo_termino` | date | sim |  |  |  |  |
| `beneficiario_id` | uuid | sim |  | → usuarios |  |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `prestcont_remessa_bubble_id_key`, `prestcont_remessa_pkey`
