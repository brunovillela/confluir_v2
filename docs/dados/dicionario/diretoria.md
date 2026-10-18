<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diretoria e ofícios

11 tabelas. Diagrama: [er/diretoria.md](../er/diretoria.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [dir_liberacao_historico](#dir_liberacao_historico) | **sensível: sindical**, trabalhista | Período de liberação de um diretor (filiado) do trabalho para atuar no mandato sindical, herdado do Bubble. Sem uso encontrado no código (po… |
| [diretoria_atas](#diretoria_atas) | — | Atas ligadas a um mandato da diretoria, só com bubble_id. Sem uso encontrado no código (possível legado do Bubble), substituída por reuniao_… |
| [diretoria_ficha](#diretoria_ficha) | identificação, **sensível: saúde**, financeiro, trabalhista | Ficha cadastral complementar de um integrante da diretoria, preenchida em Institucional > Diretoria: contato particular, endereço, vínculo c… |
| [diretoria_grupos](#diretoria_grupos) | — | Grupos (blocos) em que os integrantes de um mandato são organizados na tela da diretoria, por exemplo Executiva e Conselho Fiscal. |
| [diretoria_instancia_assentos](#diretoria_instancia_assentos) | **sensível: sindical**, identificação | Assento de um integrante da diretoria numa instância externa (conselho, federação, comissão), com cargo, período e documento de nomeação. |
| [diretoria_instancias](#diretoria_instancias) | — | Cadastro das instâncias externas (conselhos, federações, comissões) em que a diretoria tem assentos. |
| [diretoria_integrantes](#diretoria_integrantes) | identificação, **sensível: sindical** | Roster de integrantes de cada mandato da diretoria. O signatário de um ofício sai daqui (pode_assinar = true no mandato vigente). |
| [diretoria_liberacoes](#diretoria_liberacoes) | identificação, **sensível: sindical**, trabalhista | Liberação de um diretor ou trabalhador da base pelo empregador para atividade sindical (permanente ou pontual), com período, documento e ofí… |
| [diretoria_mandatos](#diretoria_mandatos) | identificação | Mandato da diretoria (período, ata de posse, registro e regimentos), vindo do Bubble e mantido em Institucional > Diretoria. Pai de integran… |
| [oficios](#oficios) | identificação, **sensível: sindical** | Ofício numerado por ano emitido pela entidade: manual ou automático de filiação/desfiliação para a fonte pagadora, com signatário da diretor… |
| [oficios_filiados](#oficios_filiados) | identificação, **sensível: sindical** | Lista de trabalhadores de um ofício automático de filiação ou desfiliação, com nome e matrícula em snapshot. A presença na lista revela a fi… |

## dir_liberacao_historico

Período de liberação de um diretor (filiado) do trabalho para atuar no mandato sindical, herdado do Bubble. Sem uso encontrado no código (possível legado do Bubble); vazia.

- **LGPD:** **sensível: sindical**, trabalhista · titulares: diretores
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `periodo_inicio` | date | sim |  |  | trabalhista | Início da liberação do empregador para o mandato. |
| `periodo_termino` | date | sim |  |  | trabalhista |  |
| `filiado_id` | uuid | sim |  | → filiacoes | **sensível: sindical** |  |
| `mandato_id` | uuid | sim |  | → diretoria_mandatos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `dir_liberacao_historico_bubble_id_key`, `dir_liberacao_historico_pkey`

## diretoria_atas

Atas ligadas a um mandato da diretoria, só com bubble_id. Sem uso encontrado no código (possível legado do Bubble), substituída por reuniao_ata.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `mandato_id` | uuid | sim |  | → diretoria_mandatos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `diretoria_atas_bubble_id_key`, `diretoria_atas_pkey`

## diretoria_ficha

Ficha cadastral complementar de um integrante da diretoria, preenchida em Institucional > Diretoria: contato particular, endereço, vínculo com o empregador, dados bancários, tipo sanguíneo, restrição física e contato de emergência.

- **LGPD:** identificação, **sensível: saúde**, financeiro, trabalhista · titulares: diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `integrante_id` | uuid | não |  | → diretoria_integrantes (**cascade**) |  |  |
| `data_nascimento` | date | sim |  |  | identificação |  |
| `email_particular` | text | sim |  |  | identificação |  |
| `telefone_particular` | text | sim |  |  | identificação |  |
| `telefone_whatsapp` | boolean | não | `false` |  |  |  |
| `tamanho_camisa` | text | sim |  |  | identificação |  |
| `tipo_sanguineo` | text | sim |  |  | **sensível: saúde** |  |
| `cep` | text | sim |  |  | identificação |  |
| `logradouro` | text | sim |  |  | identificação |  |
| `numero` | text | sim |  |  | identificação |  |
| `complemento` | text | sim |  |  | identificação |  |
| `bairro` | text | sim |  |  | identificação |  |
| `cidade` | text | sim |  |  | identificação |  |
| `estado` | text | sim |  |  | identificação |  |
| `tipo_vinculo` | text | sim |  |  | trabalhista |  |
| `empregador_id` | uuid | sim |  | → empresa | trabalhista |  |
| `matricula_empregador` | text | sim |  |  | identificação |  |
| `base_operacional` | text | sim |  |  | trabalhista | Base ou unidade de trabalho do diretor no empregador. |
| `banco` | text | sim |  |  | financeiro |  |
| `agencia` | text | sim |  |  | financeiro |  |
| `conta_corrente` | text | sim |  |  | financeiro |  |
| `pix` | text | sim |  |  | financeiro |  |
| `tipo_chave_pix` | text | sim |  |  | financeiro |  |
| `tem_restricao` | boolean | não | `false` |  | **sensível: saúde** | Possui restrição sensorial ou física (deficiência). |
| `restricao_descricao` | text | sim |  |  | **sensível: saúde** | Descrição livre da restrição sensorial ou física. |
| `contato_emergencia` | text | sim |  |  | identificação | Nome de terceiro para emergência. |
| `telefone_emergencia` | text | sim |  |  | identificação |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (integrante_id)`

Índices: `diretoria_ficha_integrante_id_key`, `diretoria_ficha_pkey`, `idx_diretoria_ficha_emp`

## diretoria_grupos

Grupos (blocos) em que os integrantes de um mandato são organizados na tela da diretoria, por exemplo Executiva e Conselho Fiscal.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `mandato_id` | uuid | não |  | → diretoria_mandatos (**cascade**) |  |  |
| `nome` | text | não |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `diretoria_grupos_pkey`, `idx_diretoria_grupos_mandato`

## diretoria_instancia_assentos

Assento de um integrante da diretoria numa instância externa (conselho, federação, comissão), com cargo, período e documento de nomeação.

- **LGPD:** **sensível: sindical**, identificação · titulares: diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `instancia_id` | uuid | não |  | → diretoria_instancias (**cascade**) |  |  |
| `integrante_id` | uuid | sim |  | → diretoria_integrantes (set null) |  |  |
| `cargo` | text | sim |  |  | **sensível: sindical** | Cargo de representação sindical exercido na instância. |
| `mandato_inicio` | date | sim |  |  |  |  |
| `mandato_fim` | date | sim |  |  |  |  |
| `documento_url` | text | sim |  |  | identificação | Documento de nomeação; contém nome do diretor. |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `mandato_id` | uuid | sim |  | → diretoria_mandatos (set null) |  |  |

Índices: `diretoria_instancia_assentos_pkey`, `idx_diretoria_assentos_instancia`, `idx_diretoria_assentos_integrante`, `idx_diretoria_assentos_mandato`

## diretoria_instancias

Cadastro das instâncias externas (conselhos, federações, comissões) em que a diretoria tem assentos.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `nome` | text | não |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `diretoria_instancias_pkey`

## diretoria_integrantes

Roster de integrantes de cada mandato da diretoria. O signatário de um ofício sai daqui (pode_assinar = true no mandato vigente).

- **LGPD:** identificação, **sensível: sindical** · titulares: diretores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `mandato_id` | uuid | não |  | → diretoria_mandatos (**cascade**) |  |  |
| `usuario_id` | uuid | sim |  | → usuarios (set null) |  |  |
| `nome` | text | não |  |  | identificação |  |
| `cargo` | text | sim |  |  | **sensível: sindical** | Cargo na diretoria sindical. |
| `ordem` | integer | não | `0` |  |  |  |
| `pode_assinar` | boolean | não | `true` |  |  | Habilita o integrante como signatário de ofícios. |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `grupo_id` | uuid | sim |  | → diretoria_grupos (set null) |  |  |
| `filiacao_id` | uuid | sim |  |  | **sensível: sindical** |  |
| `cpf` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `situacao` | text | não | `'exercicio'::text` |  | **sensível: sindical** | exercicio \| licenciado \| excluido — licenciado e excluído não assinam ofícios. |
| `situacao_desde` | date | sim |  |  |  |  |
| `situacao_motivo` | text | sim |  |  | **sensível: sindical** | Motivo do licenciamento ou exclusão do diretor; texto livre. |

Checks: `diretoria_integrantes_situacao_check` `CHECK ((situacao = ANY (ARRAY['exercicio'::text, 'licenciado'::text, 'excluido'::text])))`

Índices: `diretoria_integrantes_pkey`, `idx_diretoria_integrantes_cpf`, `idx_diretoria_integrantes_mandato`

## diretoria_liberacoes

Liberação de um diretor ou trabalhador da base pelo empregador para atividade sindical (permanente ou pontual), com período, documento e ofício que a pediu.

- **LGPD:** identificação, **sensível: sindical**, trabalhista · titulares: diretores e filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `integrante_id` | uuid | sim |  | → diretoria_integrantes (**cascade**) |  |  |
| `empresa_id` | uuid | sim |  | → empresa (set null) | trabalhista | Empregador que libera a pessoa. |
| `tipo` | text | não | `'permanente'::text` |  | trabalhista | permanente ou pontual. |
| `inicio` | date | sim |  |  | trabalhista |  |
| `fim` | date | sim |  |  | trabalhista |  |
| `documento_url` | text | sim |  |  | **sensível: sindical** | Documento da liberação sindical. |
| `observacao` | text | sim |  |  | trabalhista |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `mandato_id` | uuid | sim |  | → diretoria_mandatos (set null) |  |  |
| `filiacao_id` | uuid | sim |  | → filiacoes (set null) | **sensível: sindical** | Trabalhador da base liberado sem ser diretor (integrante_id nulo). |
| `nome` | text | sim |  |  | identificação |  |
| `cpf` | text | sim |  |  | identificação |  |
| `oficio_id` | uuid | sim |  | → oficios (set null) |  |  |
| `lote_id` | uuid | sim |  |  |  | Liberações lançadas juntas, pelo mesmo ofício. |

Checks: `diretoria_liberacoes_tem_pessoa` `CHECK (((integrante_id IS NOT NULL) OR (filiacao_id IS NOT NULL) OR (nome IS NOT NULL)))`

Índices: `diretoria_liberacoes_pkey`, `idx_diretoria_liberacoes_integrante`, `idx_diretoria_liberacoes_lote`, `idx_diretoria_liberacoes_mandato`, `idx_diretoria_liberacoes_oficio`

## diretoria_mandatos

Mandato da diretoria (período, ata de posse, registro e regimentos), vindo do Bubble e mantido em Institucional > Diretoria. Pai de integrantes, grupos, liberações e atas.

- **LGPD:** identificação
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `mandato` | text | sim |  |  |  |  |
| `edicao_bloqueada` | boolean | sim | `false` |  |  | Trava a edição do mandato encerrado. |
| `data_inicio` | date | sim |  |  |  |  |
| `data_termino` | date | sim |  |  |  |  |
| `arquivo_ata_posse` | text | sim |  |  | identificação | Ata de posse; lista nomes dos diretores eleitos. |
| `arquivo_registro_diretoria` | text | sim |  |  |  |  |
| `arquivo_regimento_diretoria` | text | sim |  |  |  |  |
| `arquivo_regimento_cf` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `diretoria_mandatos_bubble_id_key`, `diretoria_mandatos_pkey`

## oficios

Ofício numerado por ano emitido pela entidade: manual ou automático de filiação/desfiliação para a fonte pagadora, com signatário da diretoria. Inclui o histórico importado do Bubble com o PDF assinado.

- **LGPD:** identificação, **sensível: sindical** · titulares: diretores (signatários) e filiados citados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `tipo` | text | não | `'manual'::text` |  |  | desfiliacao, filiacao ou manual. |
| `numero` | integer | sim |  |  |  |  |
| `ano` | integer | sim |  |  |  |  |
| `data` | date | sim |  |  |  |  |
| `sede_id` | uuid | sim |  | → empresa_sede (set null) |  |  |
| `destinatario_empresa_id` | uuid | sim |  | → empresa (set null) |  |  |
| `destinatario_texto` | text | sim |  |  | identificação | Destinatário fora do cadastro; pode ser pessoa. |
| `assunto` | text | sim |  |  |  |  |
| `corpo` | text | sim |  |  | **sensível: sindical** | Texto livre; em ofícios de filiação/desfiliação ou liberação cita trabalhadores pelo nome. |
| `saudacao` | text | sim | `'Prezados,'::text` |  |  |  |
| `fecho` | text | sim | `'Cordialmente,'::text` |  |  |  |
| `assinante_integrante_id` | uuid | sim |  | → diretoria_integrantes (set null) |  |  |
| `assinante_nome` | text | sim |  |  | identificação |  |
| `assinante_cargo` | text | sim |  |  | **sensível: sindical** |  |
| `situacao` | text | não | `'Rascunho'::text` |  |  |  |
| `emitido_em` | timestamp with time zone | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `aos_cuidados` | text | sim |  |  | identificação |  |
| `arquivo_assinado` | text | sim |  |  | **sensível: sindical** | PDF assinado do ofício (histórico do Bubble) — bucket documentos, oficios/<id>/. |
| `arquivos_resposta` | text | sim |  |  | identificação | Respostas recebidas ao ofício (lista JSON de caminhos no bucket documentos). |
| `departamento_id` | uuid | sim |  | → empresa_departamentos |  |  |
| `redator_id` | uuid | sim |  | → usuarios |  |  |
| `enviado_por_id` | uuid | sim |  | → usuarios |  |  |
| `cancelado_em` | timestamp with time zone | sim |  |  |  | Quando o ofício foi cancelado (situacao = Cancelado). Ofícios cancelados antes de 02/10/2026 ficam sem data. |
| `cancelado_por_id` | uuid | sim |  | → usuarios (set null) |  | Usuário do painel que cancelou o ofício. |
| `cancelamento_motivo` | text | sim |  |  |  | Motivo do cancelamento (obrigatório no painel, mín. 10 caracteres). Aparece na página pública /verificar quando o ofício tinha assinatura eletrônica. |

Únicas: `UNIQUE (emp_proprietaria_id, ano, numero)`

Índices: `idx_oficios_ano`, `idx_oficios_departamento`, `idx_oficios_destinatario`, `idx_oficios_situacao`, `oficios_numero_ano_unico`, `oficios_pkey`

## oficios_filiados

Lista de trabalhadores de um ofício automático de filiação ou desfiliação, com nome e matrícula em snapshot. A presença na lista revela a filiação ou desfiliação.

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `oficio_id` | uuid | não |  | → oficios (**cascade**) |  |  |
| `filiacao_id` | uuid | sim |  |  | **sensível: sindical** |  |
| `vinculo_id` | uuid | sim |  |  | **sensível: sindical** |  |
| `nome` | text | sim |  |  | identificação |  |
| `matricula` | text | sim |  |  | identificação |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_oficios_filiados_oficio`, `idx_oficios_filiados_vinculo`, `oficios_filiados_pkey`
