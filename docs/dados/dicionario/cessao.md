<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Cessão de espaços

10 tabelas. Diagrama: [er/cessao.md](../er/cessao.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [cessao_custeio_itens](#cessao_custeio_itens) | — | Itens do custeio da cessão (limpeza, som, segurança). A soma alimenta custeio_valor e vai para o termo. |
| [cessao_espaco_bloqueios](#cessao_espaco_bloqueios) | — | Períodos em que o espaço não pode ser cedido (manutenção, agenda prioritária). Término nulo = prazo indefinido, encerrado à mão. |
| [cessao_espaco_exigencias](#cessao_espaco_exigencias) | — | Regras de bombeiro civil e segurança do espaço, por faixa de público e por condição do evento. Somam entre si. |
| [cessao_espaco_janelas](#cessao_espaco_janelas) | — | Dias da semana e faixas de horário em que o espaço pode ser cedido, por slots fixos ou horário livre. |
| [cessao_espaco_recintos](#cessao_espaco_recintos) | — | Ambientes (patrimonio_recinto) que compõem o espaço cedível. Muitos-para-muitos: dois espaços que compartilham um ambiente conflitam entre s… |
| [cessao_espacos](#cessao_espacos) | — | Espaço que a entidade pode ceder. Agrupa um ou mais ambientes (patrimonio_recinto) e guarda as regras da cessão: lotação, visita técnica, te… |
| [cessao_solicitacao_eventos](#cessao_solicitacao_eventos) | identificação | Trilha do pedido: o que aconteceu, quando e quem fez. Responde "por que este pedido foi recusado" meses depois. |
| [cessao_solicitacao_exigencias](#cessao_solicitacao_exigencias) | — | Cópia das exigências que valeram no momento do pedido. A regra do espaço pode mudar depois; o que foi acordado, não. |
| [cessao_solicitacoes](#cessao_solicitacoes) | identificação, financeiro, **sensível: sindical**, **credencial (nunca exportar)** | Pedido de cessão de um espaço, feito pelo link público ou pelo painel. Guarda quem pede, quando, para quê e as respostas que disparam as exi… |
| [cessao_termos](#cessao_termos) | — | Modelo padrão do termo de cessão, versionado por tenant. No máximo um em vigor; os demais são o histórico. |

## cessao_custeio_itens

Itens do custeio da cessão (limpeza, som, segurança). A soma alimenta custeio_valor e vai para o termo.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `solicitacao_id` | uuid | sim |  | → cessao_solicitacoes (**cascade**) |  |  |
| `descricao` | text | sim |  |  |  |  |
| `valor` | numeric(15,2) | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `cessao_custeio_itens_pkey`, `idx_cessao_custeio_solic`

## cessao_espaco_bloqueios

Períodos em que o espaço não pode ser cedido (manutenção, agenda prioritária). Término nulo = prazo indefinido, encerrado à mão.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `espaco_id` | uuid | sim |  | → cessao_espacos (**cascade**) |  |  |
| `inicio` | timestamp with time zone | sim |  |  |  |  |
| `termino` | timestamp with time zone | sim |  |  |  |  |
| `motivo` | text | não | `'manutencao'::text` |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `encerrado_em` | timestamp with time zone | sim |  |  |  |  |
| `encerrado_por_id` | uuid | sim |  | → usuarios |  |  |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_cessao_bloqueio_motivo` `CHECK ((motivo = ANY (ARRAY['manutencao'::text, 'agenda_prioritaria'::text, 'outro'::text]))) NOT VALID`; `ck_cessao_bloqueio_periodo` `CHECK (((termino IS NULL) OR (termino > inicio))) NOT VALID`

Índices: `cessao_espaco_bloqueios_pkey`, `idx_cessao_bloqueio_espaco`

## cessao_espaco_exigencias

Regras de bombeiro civil e segurança do espaço, por faixa de público e por condição do evento. Somam entre si.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `espaco_id` | uuid | sim |  | → cessao_espacos (**cascade**) |  |  |
| `gatilho` | text | não | `'publico'::text` |  |  | Condição que dispara a regra: faixa de público ou característica do evento (infantil, idoso, mobilidade, bebida, estresse). |
| `de` | integer | sim |  |  |  | Início da faixa de público. |
| `ate` | integer | sim |  |  |  | Fim da faixa de público. |
| `bombeiros` | integer | não | `0` |  |  |  |
| `segurancas` | integer | não | `0` |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_cessao_exig_faixa` `CHECK (((gatilho <> 'publico'::text) OR ((de IS NOT NULL) AND ((ate IS NULL) OR (ate >= de))))) NOT VALID`; `ck_cessao_exig_gatilho` `CHECK ((gatilho = ANY (ARRAY['publico'::text, 'infantil'::text, 'idoso'::text, 'mobilidade'::text, 'bebida'::text, 'estresse'::text]))) NOT VALID`

Índices: `cessao_espaco_exigencias_pkey`, `idx_cessao_exig_espaco`

## cessao_espaco_janelas

Dias da semana e faixas de horário em que o espaço pode ser cedido, por slots fixos ou horário livre.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `espaco_id` | uuid | sim |  | → cessao_espacos (**cascade**) |  |  |
| `dia_semana` | smallint | sim |  |  |  |  |
| `hora_inicio` | time without time zone | sim |  |  |  |  |
| `hora_termino` | time without time zone | sim |  |  |  |  |
| `modo` | text | não | `'livre'::text` |  |  | Slots fixos ou horário livre. |
| `slot_minutos` | integer | sim |  |  |  | Duração de cada slot quando modo é por slots. |
| `rotulo` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_cessao_janela_dia` `CHECK (((dia_semana >= 0) AND (dia_semana <= 6))) NOT VALID`; `ck_cessao_janela_horas` `CHECK ((hora_inicio < hora_termino)) NOT VALID`; `ck_cessao_janela_modo` `CHECK ((modo = ANY (ARRAY['slots'::text, 'livre'::text]))) NOT VALID`; `ck_cessao_janela_slot` `CHECK (((modo <> 'slots'::text) OR ((slot_minutos IS NOT NULL) AND (slot_minutos > 0)))) NOT VALID`

Índices: `cessao_espaco_janelas_pkey`, `ex_cessao_janela_livre_sobreposta`, `idx_cessao_janela_espaco`

## cessao_espaco_recintos

Ambientes (patrimonio_recinto) que compõem o espaço cedível. Muitos-para-muitos: dois espaços que compartilham um ambiente conflitam entre si.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `espaco_id` | uuid | sim |  | → cessao_espacos (**cascade**) |  |  |
| `recinto_id` | uuid | sim |  | → patrimonio_recinto |  |  |
| `principal` | boolean | não | `false` |  |  | Ambiente principal do espaço. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `cessao_espaco_recintos_pkey`, `idx_cessao_recinto_espaco`, `ux_cessao_espaco_recinto`

## cessao_espacos

Espaço que a entidade pode ceder. Agrupa um ou mais ambientes (patrimonio_recinto) e guarda as regras da cessão: lotação, visita técnica, termo, autorização e quem pode solicitar.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `sede_id` | uuid | sim |  | → empresa_sede |  |  |
| `capacidade_pessoas` | integer | sim |  |  |  |  |
| `foto_url` | text | sim |  |  |  |  |
| `visita_tecnica` | text | não | `'facultativa'::text` |  |  | Regra de visita técnica prévia (obrigatória, opcional, dispensada). |
| `exige_termo` | boolean | não | `true` |  |  |  |
| `exige_autorizacao` | boolean | não | `true` |  |  |  |
| `publico_alvo` | text | não | `'qualquer'::text` |  |  | Quem pode solicitar a cessão (filiados, público em geral etc.). |
| `agenda_publica` | boolean | não | `true` |  |  |  |
| `responsavel_visita_id` | uuid | sim |  | → usuarios |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_cessao_espacos_capacidade` `CHECK (((capacidade_pessoas IS NULL) OR (capacidade_pessoas > 0))) NOT VALID`; `ck_cessao_espacos_publico` `CHECK ((publico_alvo = ANY (ARRAY['qualquer'::text, 'interno'::text, 'filiados'::text]))) NOT VALID`; `ck_cessao_espacos_visita` `CHECK ((visita_tecnica = ANY (ARRAY['obrigatoria'::text, 'facultativa'::text, 'dispensada'::text]))) NOT VALID`

Índices: `cessao_espacos_pkey`, `idx_cessao_espacos_sede`, `ux_cessao_espacos_slug`

## cessao_solicitacao_eventos

Trilha do pedido: o que aconteceu, quando e quem fez. Responde "por que este pedido foi recusado" meses depois.

- **LGPD:** identificação · titulares: solicitantes de cessão (filiados e público externo)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `solicitacao_id` | uuid | sim |  | → cessao_solicitacoes (**cascade**) |  |  |
| `tipo` | text | sim |  |  |  |  |
| `detalhe` | text | sim |  |  | identificação | Texto livre do evento da trilha; pode citar o solicitante. |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `cessao_solicitacao_eventos_pkey`, `idx_cessao_solic_eventos`

## cessao_solicitacao_exigencias

Cópia das exigências que valeram no momento do pedido. A regra do espaço pode mudar depois; o que foi acordado, não.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `solicitacao_id` | uuid | sim |  | → cessao_solicitacoes (**cascade**) |  |  |
| `gatilho` | text | sim |  |  |  |  |
| `motivo` | text | sim |  |  |  |  |
| `bombeiros` | integer | não | `0` |  |  |  |
| `segurancas` | integer | não | `0` |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `cessao_solicitacao_exigencias_pkey`, `idx_cessao_solic_exig`

## cessao_solicitacoes

Pedido de cessão de um espaço, feito pelo link público ou pelo painel. Guarda quem pede, quando, para quê e as respostas que disparam as exigências de segurança.

- **LGPD:** identificação, financeiro, **sensível: sindical**, **credencial (nunca exportar)** · titulares: solicitantes de cessão (filiados e público externo), representantes
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `espaco_id` | uuid | sim |  | → cessao_espacos |  |  |
| `numero` | integer | sim |  |  |  |  |
| `solicitante_nome` | text | sim |  |  | identificação |  |
| `solicitante_cpf` | text | sim |  |  | identificação |  |
| `solicitante_email` | text | sim |  |  | identificação |  |
| `solicitante_telefone` | text | sim |  |  | identificação |  |
| `entidade` | text | sim |  |  |  |  |
| `representante_nome` | text | sim |  |  | identificação |  |
| `representante_telefone` | text | sim |  |  | identificação |  |
| `identificacao` | text | sim |  |  | identificação | Como o solicitante se identificou (filiado, CPF, entidade). |
| `filiacao_id` | uuid | sim |  | → filiacoes | **sensível: sindical** | Vínculo com a filiação quando o solicitante é filiado; revela a condição de filiado. |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `inicio` | timestamp with time zone | sim |  |  |  |  |
| `termino` | timestamp with time zone | sim |  |  |  |  |
| `montagem_inicio` | timestamp with time zone | sim |  |  |  |  |
| `desmontagem_termino` | timestamp with time zone | sim |  |  |  |  |
| `finalidade` | text | sim |  |  |  |  |
| `publico_estimado` | integer | sim |  |  |  |  |
| `tem_infantil` | boolean | não | `false` |  |  | Respostas sobre o evento que disparam exigências de segurança (idem tem_idoso, tem_mobilidade, tem_bebida, tem_estresse). |
| `tem_idoso` | boolean | não | `false` |  |  |  |
| `tem_mobilidade` | boolean | não | `false` |  |  |  |
| `tem_bebida` | boolean | não | `false` |  |  |  |
| `tem_estresse` | boolean | não | `false` |  |  |  |
| `observacoes` | text | sim |  |  | identificação | Texto livre do solicitante. |
| `situacao` | text | não | `'rascunho'::text` |  |  |  |
| `recusa_motivo` | text | sim |  |  |  | Motivo da recusa do pedido. |
| `enviada_em` | timestamp with time zone | sim |  |  |  |  |
| `token` | uuid | não | `gen_random_uuid()` |  | **credencial (nunca exportar)** | Token do link público de acompanhamento do pedido. |
| `codigo_hash` | text | sim |  |  | **credencial (nunca exportar)** | Hash do código de verificação de e-mail. |
| `codigo_expira_em` | timestamp with time zone | sim |  |  |  |  |
| `codigo_tentativas` | integer | não | `0` |  |  | Tentativas de digitação do código de verificação. |
| `email_confirmado_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `analista_id` | uuid | sim |  | → usuarios |  |  |
| `visita_agendada_em` | timestamp with time zone | sim |  |  |  |  |
| `visita_responsavel_id` | uuid | sim |  | → usuarios |  |  |
| `visita_realizada_em` | timestamp with time zone | sim |  |  |  |  |
| `visita_parecer` | text | sim |  |  |  |  |
| `visita_dispensada` | boolean | não | `false` |  |  |  |
| `autorizacao_situacao` | text | não | `'pendente'::text` |  |  |  |
| `autorizacao_por_id` | uuid | sim |  | → usuarios |  |  |
| `autorizacao_em` | timestamp with time zone | sim |  |  |  |  |
| `autorizacao_parecer` | text | sim |  |  |  |  |
| `custeio_valor` | numeric(15,2) | sim |  |  |  |  |
| `custeio_observacao` | text | sim |  |  |  |  |
| `custeio_pago_em` | timestamp with time zone | sim |  |  |  |  |
| `custeio_comprovante` | text | sim |  |  | financeiro | Comprovante de pagamento do custeio, pode ser de pessoa física. |
| `confirmada_em` | timestamp with time zone | sim |  |  |  |  |
| `confirmada_por_id` | uuid | sim |  | → usuarios |  |  |
| `termo_texto` | text | sim |  |  | identificação | Modelo renderizado com os dados desta cessão, congelado. Revisar o modelo não altera termos já gerados. |
| `termo_codigo` | text | sim |  |  |  |  |
| `termo_gerado_em` | timestamp with time zone | sim |  |  |  |  |
| `termo_gerado_por_id` | uuid | sim |  | → usuarios |  |  |
| `termo_hash` | text | sim |  |  |  | SHA-256 do texto no momento do envio para assinatura. Confere de novo na hora de assinar: se o termo mudou, a assinatura não vale. |
| `termo_assinado_em` | timestamp with time zone | sim |  |  |  |  |
| `termo_pdf` | text | sim |  |  | identificação | PDF do termo assinado, com dados do solicitante. |
| `visita_participante` | text | sim |  |  | identificação | Quem compareceu à visita técnica pelo solicitante. A visita é obrigação de quem recebe o espaço; a entidade acompanha. |

Checks: `ck_cessao_solic_autorizacao` `CHECK ((autorizacao_situacao = ANY (ARRAY['pendente'::text, 'autorizada'::text, 'negada'::text]))) NOT VALID`; `ck_cessao_solic_custeio` `CHECK (((custeio_valor IS NULL) OR (custeio_valor >= (0)::numeric))) NOT VALID`; `ck_cessao_solic_identificacao` `CHECK (((identificacao IS NULL) OR (identificacao = ANY (ARRAY['email'::text, 'filiado'::text, 'interno'::text])))) NOT VALID`; `ck_cessao_solic_periodo` `CHECK (((termino IS NULL) OR (inicio IS NULL) OR (termino > inicio))) NOT VALID`; `ck_cessao_solic_situacao` `CHECK ((situacao = ANY (ARRAY['rascunho'::text, 'solicitada'::text, 'em_analise'::text, 'recusada'::text, 'cancelada'::text, 'confirmada'::text]))) NOT VALID`

Índices: `cessao_solicitacoes_pkey`, `idx_cessao_solic_espaco`, `idx_cessao_solic_situacao`, `ux_cessao_solic_numero`, `ux_cessao_solic_token`

## cessao_termos

Modelo padrão do termo de cessão, versionado por tenant. No máximo um em vigor; os demais são o histórico.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `texto` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `em_vigor` | boolean | não | `false` |  |  |  |
| `criado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `cessao_termos_pkey`, `idx_cessao_termos_emp`
