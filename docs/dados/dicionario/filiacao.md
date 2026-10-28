<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Filiação e portal do associado

50 tabelas. Diagrama: [er/filiacao.md](../er/filiacao.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [dados_bancarios](#dados_bancarios) | financeiro, identificação | Dados bancários e chaves Pix de usuários, filiados e fornecedores (migrado do Bubble). Usado como destino de pagamento em ordens, compras, c… |
| [emails](#emails) | identificação | E-mails de contato de usuários e filiados (vários por pessoa, com tipo e favorito), migrados do Bubble. Lidos nos contatos do filiado e no e… |
| [emails_institucionais](#emails_institucionais) | identificação | Endereços de e-mail institucionais da entidade (presidencia@, juridico@...) e o funcionário responsável por cada um. Apenas registro, sem ca… |
| [enderecos](#enderecos) | identificação | Endereços de usuários, filiados e empresas (vários por titular, com tipo e favorito), migrados do Bubble. Usados nos contatos do filiado, et… |
| [filiacao_carencias](#filiacao_carencias) | — | Regras de carência por benefício: quantos dias após a filiação o associado passa a ter direito (voto, hospedagem, convênios...). Configuraçã… |
| [filiacao_cobranca_config](#filiacao_cobranca_config) | — | Configuração da cobrança direta da mensalidade por entidade (valor, dia de vencimento, geração automática e mensagem). |
| [filiacao_cobrancas](#filiacao_cobrancas) | **sensível: sindical**, financeiro, identificação | Cobranças de mensalidade emitidas ao filiado (Pix ou boleto) por competência, com situação e conciliação bancária. Exibidas na área do assoc… |
| [filiacao_coletiva](#filiacao_coletiva) | — | Lotes de filiação coletiva gerados a partir de uma assembleia/acordo: aptos viram filiados, com prazo de desistência e possibilidade de reve… |
| [filiacao_coletiva_itens](#filiacao_coletiva_itens) | **sensível: sindical**, identificação, trabalhista | Um item por apto do lote de filiação coletiva, com os dados congelados na conciliação, como casou com o cadastro e o resultado (criado, mant… |
| [filiacao_contatos_emergencia](#filiacao_contatos_emergencia) | identificação, **sensível: sindical** | Contatos de emergência do filiado (nome, telefone, parentesco), informados pelo portal ou pela secretaria. |
| [filiacao_convenios](#filiacao_convenios) | — | Convênios oferecidos aos filiados por empresas conveniadas (migrado do Bubble), com fotos, vantagens, arquivo do convênio e vigência. |
| [filiacao_convenios_categorias](#filiacao_convenios_categorias) | — | Categorias dos convênios (saúde, educação, lazer...), migradas do Bubble. |
| [filiacao_convenios_unidades](#filiacao_convenios_unidades) | — | Unidades de atendimento de cada convênio (endereço, telefones, e-mails, site, atendimento online/presencial), migradas do Bubble. |
| [filiacao_duplicidades_ignoradas](#filiacao_duplicidades_ignoradas) | identificação | Grupos de cadastros de filiados conferidos e marcados como NÃO duplicidade, para não reaparecerem na tela de duplicidades. |
| [filiacao_inadimplencia_regras](#filiacao_inadimplencia_regras) | — | Regras de inadimplência por entidade: quantas remessas sem contribuição (consecutivas ou numa janela) suspendem direitos do filiado. |
| [filiacao_prontuario](#filiacao_prontuario) | **sensível: sindical**, **sensível: saúde** | Prontuário do filiado: registro cronológico dos eventos da pessoa no sindicato (atendimentos, homologações, hospedagens, assembleias, atuali… |
| [filiacao_recebe](#filiacao_recebe) | **sensível: sindical**, financeiro, identificação, trabalhista | Cada linha é a contribuição de um trabalhador numa remessa (relação de descontos de uma fonte pagadora, Pix ou boleto), importada em Receita… |
| [filiacao_recebe_comprovacao](#filiacao_recebe_comprovacao) | — | Comprovantes de repasse das contribuições pela fonte pagadora em cada remessa (data, valor, arquivo), usados na conciliação de Receitas. Mig… |
| [filiacao_recebe_remessa](#filiacao_recebe_remessa) | — | Remessas de contribuições por fonte pagadora e competência (ano/mês), agrupando as linhas de filiacao_recebe. Migrado do Bubble. |
| [filiacao_reembolsos](#filiacao_reembolsos) | financeiro, **sensível: sindical** | Reembolsos pagos ao filiado — desconto salarial de greve, cobrança indevida, despesa em atividade sindical —, com tipo, justificativa, proje… |
| [filiacao_reembolsos_config](#filiacao_reembolsos_config) | — | Configuração dos reembolsos a filiados: valor padrão, centro de custo e orçamento mensal limite. |
| [filiacao_registro](#filiacao_registro) | identificação, **sensível: sindical** | Registro de filiação com CPF, nome, sexo, matrícula e condição sindical. Sem uso encontrado no código (possível legado do Bubble, substituíd… |
| [filiacao_solicitacao_eventos](#filiacao_solicitacao_eventos) | **sensível: sindical**, identificação | Trilha de eventos de cada solicitação de filiação pela ficha pública (criada, código enviado, e-mail verificado, assinada, avaliada...), com… |
| [filiacao_solicitacoes](#filiacao_solicitacoes) | **sensível: sindical**, identificação, trabalhista, **credencial (nunca exportar)** | Solicitações de filiação feitas pela ficha pública (/filiar) sem login: dados pessoais, vínculo, aceites LGPD e de desconto, verificação de … |
| [filiacao_suspensoes](#filiacao_suspensoes) | **sensível: sindical**, financeiro, identificação | Dispensas concedidas a um filiado (por CPF) da regra de carência ou de inadimplência, total ou para um benefício, com vigência, motivo e rev… |
| [filiacao_tl_aceites](#filiacao_tl_aceites) | **sensível: sindical**, identificação | Registro de cada aceite de termo (LGPD ou autorização de desconto) pelo filiado, com versão do termo, origem (portal, ficha pública, secreta… |
| [filiacao_tl_desconto](#filiacao_tl_desconto) | — | Versões do termo de autorização de desconto da contribuição em folha, exibido na ficha de filiação pública. Origem Bubble. |
| [filiacao_tl_lgpd](#filiacao_tl_lgpd) | — | Versões do termo de consentimento LGPD exibido na ficha de filiação pública. Origem Bubble. |
| [filiacao_vinculos](#filiacao_vinculos) | **sensível: sindical**, trabalhista, identificação | Vínculos do filiado com cada fonte pagadora (empregador ou fundo de pensão): matrícula, cargo, lotação, admissão/demissão, datas e documento… |
| [filiacoes](#filiacoes) | identificação, **sensível: sindical**, trabalhista, financeiro, **credencial (nunca exportar)** | Cadastro do filiado (ou ex-filiado/não filiado) na entidade: identificação, contato, endereço, condição de filiação, fonte pagadora e contri… |
| [fonte_categorias](#fonte_categorias) | — | Categorias de fonte pagadora criadas pela entidade além de Empregador e Fundo de pensão; usadas na configuração da saúde dos cadastros. |
| [oposicao_campanha](#oposicao_campanha) | — | Campanhas de oposição à contribuição assistencial: empresa, prazo, vídeos obrigatórios, modo de formalização e texto da declaração. Migrado … |
| [oposicao_campanha_fontes](#oposicao_campanha_fontes) | — | Empresas (fontes pagadoras) abrangidas por cada campanha de oposição. |
| [oposicao_envios_empregador](#oposicao_envios_empregador) | identificação | Cada envio, a um empregador, da relação de oposições aprovadas de uma campanha: quem enviou, quando, por qual meio e quais oposições foram (… |
| [oposicao_eventos](#oposicao_eventos) | **sensível: sindical**, identificação | Trilha de eventos de cada carta de oposição (enviada, confirmada, avaliada, desistência...), com IP e navegador. |
| [oposicao_opositor](#oposicao_opositor) | **sensível: sindical**, identificação, trabalhista | Cada trabalhador que se opôs à contribuição assistencial numa campanha: dados pessoais, vínculo, carta/documento assinado, avaliação e desis… |
| [oposicao_perguntas](#oposicao_perguntas) | — | Perguntas do questionário de cada campanha de oposição. Migrado do Bubble. |
| [oposicao_protocolos](#oposicao_protocolos) | — | Último protocolo emitido por campanha de oposição — contador atômico (oposicao_proximo_protocolo). |
| [oposicao_regras](#oposicao_regras) | identificação | Decisões jurídicas padrão da entidade para as campanhas de oposição (carta fora do prazo, vídeo mínimo, assinaturas aceitas, prova do não fi… |
| [oposicao_resposta](#oposicao_resposta) | **sensível: sindical** | Respostas do opositor às perguntas do questionário da campanha. Migrado do Bubble. |
| [portal_atendimentos](#portal_atendimentos) | identificação, **sensível: sindical** | Atendimentos abertos pelo filiado no portal do associado (assunto, título, prazo, situação), ligados a uma demanda interna. |
| [portal_atendimentos_mensagens](#portal_atendimentos_mensagens) | identificação, **sensível: sindical** | Mensagens trocadas entre filiado e entidade em cada atendimento do portal, com anexo opcional. |
| [portal_avisos](#portal_avisos) | identificação, **sensível: sindical** | Avisos (notificações) exibidos ao filiado no portal do associado, por CPF: evento, texto, link e data de leitura. |
| [portal_avisos_preferencias](#portal_avisos_preferencias) | identificação | Preferências do filiado (por CPF) sobre quais avisos do portal também chegam por e-mail. |
| [portal_nao_filiado](#portal_nao_filiado) | identificação | Cadastro mínimo de não filiados que entram no portal (ex.: para registrar oposição à contribuição). |
| [portal_partes](#portal_partes) | — | Área do associado: estado (habilitada/suspensa/desabilitada), aviso, retorno previsto e opções de cada parte do portal, por entidade. Sem li… |
| [portal_push_assinaturas](#portal_push_assinaturas) | identificação, **credencial (nunca exportar)** | Assinaturas Web Push do navegador/celular do filiado no portal, para envio de avisos. |
| [registro_sindical](#registro_sindical) | — | Registro da entidade no Ministério do Trabalho (número, categoria, abrangência, publicação, documento), tela Registro MTE (lib/db/registro-m… |
| [telefones](#telefones) | identificação | Telefones de usuários e filiados (vários por pessoa, com tipo, WhatsApp e favorito), migrados do Bubble. |
| [vinculos_trabalhistas](#vinculos_trabalhistas) | trabalhista, identificação | Vínculos empregatícios de pessoas (funcionários da entidade no módulo Pessoal e trabalhadores filiados): empregador, cargo, CBO, lotação, ma… |

## dados_bancarios

Dados bancários e chaves Pix de usuários, filiados e fornecedores (migrado do Bubble). Usado como destino de pagamento em ordens, compras, custeios, contracheques e reembolsos.

- **LGPD:** financeiro, identificação · titulares: filiados, funcionários, diretores, fornecedores PF, usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation_pai`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `banco` | text | sim |  |  | financeiro |  |
| `agencia` | text | sim |  |  | financeiro |  |
| `conta` | text | sim |  |  | financeiro |  |
| `tipo_conta` | text | sim |  |  | financeiro |  |
| `pix` | text | sim |  |  | financeiro | Chave Pix; pode ser CPF, e-mail ou telefone da pessoa. |
| `favorecido` | text | sim |  |  | identificação | Nome do titular da conta. |
| `fornecedor_id` | uuid | sim |  | → empresa |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes (**cascade**) |  |  |
| `banco_codigo` | text | sim |  |  | financeiro |  |
| `pix_tipo` | text | sim |  |  | financeiro |  |
| `pix_beneficiario` | text | sim |  |  | identificação | Nome do titular da chave Pix. |
| `prefere_pix` | boolean | não | `false` |  |  |  |
| `favorito` | boolean | não | `false` |  |  |  |
| `tipo_dados` | text | sim |  |  |  | Campo trazido do Bubble que diferencia o tipo do registro (conta ou Pix). |
| `titular_documento` | text | sim |  |  | identificação | CPF (11 dígitos) ou CNPJ (14) do titular da conta, só dígitos. Comparado com o favorecido da ordem na regra "Conta de outro titular". |

Únicas: `UNIQUE (bubble_id)`

Checks: `dados_bancarios_titular_documento_check` `CHECK (((titular_documento IS NULL) OR (titular_documento ~ '^([0-9]{11}|[0-9]{14})$'::text)))`

Índices: `dados_bancarios_bubble_id_key`, `dados_bancarios_pkey`, `idx_dados_bancarios_filiado`, `idx_dados_bancarios_fornecedor`, `ix_dados_bancarios_filiado`, `ux_dados_bancarios_bubble`

## emails

E-mails de contato de usuários e filiados (vários por pessoa, com tipo e favorito), migrados do Bubble. Lidos nos contatos do filiado e no envio de mensagens.

- **LGPD:** identificação · titulares: filiados, usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `email` | text | sim |  |  | identificação |  |
| `tipo_email` | text | sim |  |  |  |  |
| `pessoa_contato` | text | sim |  |  | identificação | Nome da pessoa a quem o e-mail pertence, quando não é o próprio titular. |
| `favorito` | boolean | sim | `false` |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `emails_bubble_id_key`, `emails_pkey`

## emails_institucionais

Endereços de e-mail institucionais da entidade (presidencia@, juridico@...) e o funcionário responsável por cada um. Apenas registro, sem caixa de entrada.

- **LGPD:** identificação · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `endereco` | text | sim |  |  | identificação | E-mail da entidade; pode conter nome de pessoa e é ligado a um responsável. |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `emails_institucionais_bubble_id_key`, `emails_institucionais_pkey`

## enderecos

Endereços de usuários, filiados e empresas (vários por titular, com tipo e favorito), migrados do Bubble. Usados nos contatos do filiado, etiquetas dos Correios, RPA e minutas.

- **LGPD:** identificação · titulares: filiados, usuários do sistema, fornecedores PF
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `cep` | text | sim |  |  | identificação |  |
| `logradouro` | text | sim |  |  | identificação |  |
| `numero` | text | sim |  |  | identificação |  |
| `complemento` | text | sim |  |  | identificação |  |
| `complemento_correios` | text | sim |  |  | identificação | Complemento abreviado para caber na etiqueta dos Correios. |
| `bairro` | text | sim |  |  | identificação |  |
| `cidade` | text | sim |  |  | identificação |  |
| `estado` | text | sim |  |  | identificação |  |
| `nome_endereco` | text | sim |  |  |  | Apelido do endereço (ex.: Casa, Trabalho). |
| `tipo_endereco` | text | sim |  |  |  |  |
| `favorito` | boolean | sim | `false` |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `enderecos_bubble_id_key`, `enderecos_pkey`, `idx_enderecos_empresa`, `ux_enderecos_bubble`

## filiacao_carencias

Regras de carência por benefício: quantos dias após a filiação o associado passa a ter direito (voto, hospedagem, convênios...). Configuração por entidade.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `beneficio` | text | sim |  |  |  |  |
| `dias` | integer | não | `0` |  |  |  |
| `ativo` | boolean | não | `false` |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_filiacao_carencias_dias` `CHECK (((dias >= 0) AND (dias <= 3650))) NOT VALID`

Índices: `filiacao_carencias_pkey`, `ux_filiacao_carencias`

## filiacao_cobranca_config

Configuração da cobrança direta da mensalidade por entidade (valor, dia de vencimento, geração automática e mensagem).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `valor_mensal` | numeric(12,2) | sim |  |  |  |  |
| `dia_vencimento` | integer | não | `10` |  |  |  |
| `gerar_automatico` | boolean | não | `true` |  |  |  |
| `mensagem` | text | sim |  |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `filiacao_cobranca_config_dia_vencimento_check` `CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 28)))`

Índices: `filiacao_cobranca_config_pkey`

## filiacao_cobrancas

Cobranças de mensalidade emitidas ao filiado (Pix ou boleto) por competência, com situação e conciliação bancária. Exibidas na área do associado.

- **LGPD:** **sensível: sindical**, financeiro, identificação · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `filiacao_id` | uuid | não |  | → filiacoes (**cascade**) |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `competencia` | text | não |  |  |  |  |
| `ordem` | integer | não |  |  |  |  |
| `valor` | numeric(12,2) | não |  |  | financeiro |  |
| `forma` | text | não | `'pix'::text` |  |  |  |
| `vencimento` | date | não |  |  |  |  |
| `txid` | text | não |  |  |  | Identificador da cobrança Pix no provedor. |
| `brcode` | text | sim |  |  |  | Código copia-e-cola do Pix. |
| `situacao` | text | não | `'aberta'::text` |  | financeiro | Situação da cobrança (aberta, paga, vencida...). |
| `pago_em` | date | sim |  |  | financeiro |  |
| `valor_pago` | numeric(12,2) | sim |  |  | financeiro |  |
| `lancamento_id` | uuid | sim |  |  |  |  |
| `banco_lancamento_id` | uuid | sim |  |  |  |  |
| `provedor` | text | não | `'pix-estatico'::text` |  |  |  |
| `provedor_ref` | text | sim |  |  |  | Identificador da cobrança no provedor de pagamento. |
| `avisada_em` | timestamp with time zone | sim |  |  |  | Quando o filiado foi avisado da cobrança. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, txid)`; `UNIQUE (filiacao_id, competencia)`

Checks: `filiacao_cobrancas_forma_check` `CHECK ((forma = ANY (ARRAY['pix'::text, 'boleto'::text])))`; `filiacao_cobrancas_situacao_check` `CHECK ((situacao = ANY (ARRAY['aberta'::text, 'paga'::text, 'cancelada'::text])))`

Índices: `filiacao_cobrancas_cpf_idx`, `filiacao_cobrancas_emp_comp_idx`, `filiacao_cobrancas_emp_proprietaria_id_txid_key`, `filiacao_cobrancas_filiacao_id_competencia_key`, `filiacao_cobrancas_pkey`

## filiacao_coletiva

Lotes de filiação coletiva gerados a partir de uma assembleia/acordo: aptos viram filiados, com prazo de desistência e possibilidade de reversão.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `acordo_id` | uuid | sim |  | → acordo_coletivo (set null) |  |  |
| `titulo` | text | sim |  |  |  |  |
| `observacoes` | text | sim |  |  |  |  |
| `dias_desistencia` | integer | sim |  |  |  | Prazo em dias para o trabalhador desistir da filiação coletiva. |
| `situacao` | text | não | `'rascunho'::text` |  |  |  |
| `processado_em` | timestamp with time zone | sim |  |  |  |  |
| `prazo_ate` | date | sim |  |  |  |  |
| `revertido_em` | timestamp with time zone | sim |  |  |  |  |
| `revertido_por` | uuid | sim |  | → usuarios |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `filiacao_coletiva_pkey`, `idx_filiacao_coletiva_emp`, `ux_filiacao_coletiva_rodada`

## filiacao_coletiva_itens

Um item por apto do lote de filiação coletiva, com os dados congelados na conciliação, como casou com o cadastro e o resultado (criado, mantido, desistiu...).

- **LGPD:** **sensível: sindical**, identificação, trabalhista · titulares: filiados, eleitores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `coletiva_id` | uuid | sim |  | → filiacao_coletiva (**cascade**) |  |  |
| `apto_id` | uuid | sim |  | → voto_assembleias_aptos (set null) |  |  |
| `filiacao_id` | uuid | sim |  | → filiacoes (set null) |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nome_completo` | text | sim |  |  | identificação |  |
| `matricula` | text | sim |  |  | trabalhista |  |
| `email` | text | sim |  |  | identificação |  |
| `chave_casamento` | text | sim |  |  |  | Como o apto casou com o cadastro: cpf, matricula, email, nome, manual ou nenhum. |
| `resultado` | text | sim |  |  | **sensível: sindical** | mantido_ativo, criado, recarimbado, duvida, ignorado ou desistiu. |
| `condicao_anterior` | text | sim |  |  | **sensível: sindical** | Condição sindical antes do lote, para auditoria da reversão. |
| `vinculo_id` | uuid | sim |  | → filiacao_vinculos (set null) |  |  |
| `observacao` | text | sim |  |  | **sensível: sindical** |  |
| `desistencia_em` | timestamp with time zone | sim |  |  | **sensível: sindical** |  |
| `ativado_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `filiacao_coletiva_itens_pkey`, `idx_filiacao_coletiva_itens_filiacao`, `idx_filiacao_coletiva_itens_lote`

## filiacao_contatos_emergencia

Contatos de emergência do filiado (nome, telefone, parentesco), informados pelo portal ou pela secretaria.

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados e terceiros indicados (familiares)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes (**cascade**) |  |  |
| `cpf` | text | sim |  |  | identificação | CPF do filiado dono do contato. |
| `nome` | text | não | `''::text` |  | identificação |  |
| `telefone` | text | não | `''::text` |  | identificação |  |
| `vinculo` | text | sim |  |  | identificação | Parentesco ou relação com o filiado. |
| `origem` | text | não | `'painel'::text` |  |  | Onde foi informado: portal ou secretaria. |
| `atualizado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `filiacao_contatos_emergencia_pkey`, `idx_fil_contatos_emerg_cpf`, `idx_fil_contatos_emerg_filiado`

## filiacao_convenios

Convênios oferecidos aos filiados por empresas conveniadas (migrado do Bubble), com fotos, vantagens, arquivo do convênio e vigência.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `foto_principal` | text | sim |  |  |  |  |
| `ativo` | boolean | sim | `true` |  |  |  |
| `fotos_divulgacao` | text[] | sim |  |  |  |  |
| `data_termino` | date | sim |  |  |  |  |
| `arquivo_convenio` | text | sim |  |  |  |  |
| `info_sumarias` | text | sim |  |  |  | Resumo do convênio para divulgação. |
| `info_vantagens` | text | sim |  |  |  | Descrição dos descontos e vantagens. |
| `sindicato_id` | uuid | sim |  | → empresa |  |  |
| `conveniador_id` | uuid | sim |  | → empresa (set null) |  |  |
| `categoria_id` | uuid | sim |  | → filiacao_convenios_categorias (set null) |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `filiacao_convenios_bubble_id_key`, `filiacao_convenios_pkey`, `ux_filiacao_convenios_bubble`

## filiacao_convenios_categorias

Categorias dos convênios (saúde, educação, lazer...), migradas do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `categoria` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `filiacao_convenios_categorias_pkey`, `ux_filiacao_convenios_categorias_bubble`

## filiacao_convenios_unidades

Unidades de atendimento de cada convênio (endereço, telefones, e-mails, site, atendimento online/presencial), migradas do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `convenio_id` | uuid | sim |  | → filiacao_convenios (**cascade**) |  |  |
| `nome` | text | sim |  |  |  |  |
| `site` | text | sim |  |  |  |  |
| `atendimento_online` | boolean | não | `false` |  |  |  |
| `atendimento_presencial` | boolean | não | `false` |  |  |  |
| `endereco_id` | uuid | sim |  | → enderecos (set null) |  |  |
| `telefones` | text[] | sim |  |  |  |  |
| `emails` | text[] | sim |  |  |  |  |
| `fotos` | text[] | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `filiacao_convenios_unidades_pkey`, `ix_filiacao_convenios_unidades_convenio`, `ux_filiacao_convenios_unidades_bubble`

## filiacao_duplicidades_ignoradas

Grupos de cadastros de filiados conferidos e marcados como NÃO duplicidade, para não reaparecerem na tela de duplicidades.

- **LGPD:** identificação · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tipo` | text | não | `'nome'::text` |  |  | Critério do agrupamento (ex.: nome, cpf). |
| `chave` | text | não | `''::text` |  | identificação | Valor que agrupou os cadastros (nome normalizado ou CPF). |
| `cadastros` | uuid[] | não | `'{}'::uuid[]` |  |  |  |
| `motivo` | text | sim |  |  | identificação |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `filiacao_duplicidades_ignoradas_pkey`, `ux_filiacao_duplicidades_ignoradas`

## filiacao_inadimplencia_regras

Regras de inadimplência por entidade: quantas remessas sem contribuição (consecutivas ou numa janela) suspendem direitos do filiado.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tipo` | text | sim |  |  |  |  |
| `quantidade` | integer | não | `3` |  |  |  |
| `exigir_consecutivas` | boolean | não | `true` |  |  |  |
| `janela_remessas` | integer | não | `12` |  |  | Quantidade de remessas recentes consideradas na contagem. |
| `ativo` | boolean | não | `false` |  |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_filiacao_inadimplencia_qtd` `CHECK (((quantidade >= 1) AND (janela_remessas >= 1))) NOT VALID`

Índices: `filiacao_inadimplencia_regras_pkey`, `ux_filiacao_inadimplencia_tipo`

## filiacao_prontuario

Prontuário do filiado: registro cronológico dos eventos da pessoa no sindicato (atendimentos, homologações, hospedagens, assembleias, atualizações cadastrais), migrado do Bubble e alimentado por vários módulos.

- **LGPD:** **sensível: sindical**, **sensível: saúde** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `data` | timestamp with time zone | sim |  |  |  |  |
| `descricao` | text | sim |  |  | **sensível: saúde** | Texto livre do apontamento; registros do Bubble podem relatar atendimentos, inclusive de saúde e jurídicos. |
| `tipo` | text | sim |  |  | **sensível: sindical** | Categoria do evento (Atendimento, Assembleia, Filiação, Atualização cadastral...). |
| `filiacao_id` | uuid | sim |  | → filiacoes |  |  |
| `filiacao_raw` | text | sim |  |  |  |  |
| `filiacao_coletiva_raw` | text | sim |  |  |  |  |
| `diretor_funcionario_id` | uuid | sim |  | → usuarios |  | Usuário que registrou o apontamento. |
| `diretor_funcionario_raw` | text | sim |  |  |  |  |
| `homologacao_id` | uuid | sim |  | → juridico_homologacoes |  |  |
| `homologacao_raw` | text | sim |  |  |  |  |
| `hospedagem_id` | uuid | sim |  | → hospedagem_cupom |  |  |
| `hospedagem_raw` | text | sim |  |  |  |  |
| `atendimento_raw` | text | sim |  |  | **sensível: saúde** | Id do atendimento no Bubble. |
| `cipa_raw` | text | sim |  |  |  | Id do registro de CIPA no Bubble. |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` |  |  |  |
| `created_at` | timestamp with time zone | sim |  |  |  |  |
| `modified_at` | timestamp with time zone | sim |  |  |  |  |
| `atendimento_id` | uuid | sim |  | → saude_atendimentos (**cascade**) |  | Atendimento de saúde que originou o apontamento. Garante um apontamento por atendimento e remove o rastro se o atendimento for excluído. O apontamento NUNCA contém conteúdo clínico. |

Únicas: `UNIQUE (bubble_id)`

Índices: `filiacao_prontuario_atendimento_uk`, `filiacao_prontuario_bubble_id_key`, `filiacao_prontuario_pkey`

## filiacao_recebe

Cada linha é a contribuição de um trabalhador numa remessa (relação de descontos de uma fonte pagadora, Pix ou boleto), importada em Receitas. Base de inadimplência, carência e indicadores; maior tabela do sistema, migrada do Bubble.

- **LGPD:** **sensível: sindical**, financeiro, identificação, trabalhista · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `valor` | numeric(15,2) | sim |  |  | financeiro | Valor da contribuição sindical descontada. |
| `matricula_sindical` | text | sim |  |  | **sensível: sindical** |  |
| `fonte_pg_matricula` | text | sim |  |  | trabalhista | Matrícula do trabalhador na fonte pagadora. |
| `fonte_pg_id` | uuid | sim |  | → empresa |  |  |
| `fonte_pg_raw` | text | sim |  |  |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes |  |  |
| `filiado_raw` | text | sim |  |  | **sensível: sindical** | Id do filiado no Bubble. |
| `remessa_id` | uuid | sim |  | → filiacao_recebe_remessa |  |  |
| `remessa_raw` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` |  |  |  |
| `created_at` | timestamp with time zone | sim |  |  |  |  |
| `modified_at` | timestamp with time zone | sim |  |  |  |  |
| `forma_recebimento` | text | sim |  |  | financeiro | Forma de recebimento da lista importada: consignado, pix ou boleto. null = lançamento anterior a 27/09/2026 (via fonte). |
| `grupo_empresarial_id` | uuid | sim |  | → grupos_empresariais (set null) |  |  |
| `nome` | text | sim |  |  | identificação | Nome do trabalhador como veio na relação de pagamentos da fonte (informativo; vale para os não encontrados no cadastro). |

Únicas: `UNIQUE (bubble_id)`

Checks: `filiacao_recebe_forma_recebimento_check` `CHECK (((forma_recebimento IS NULL) OR (forma_recebimento = ANY (ARRAY['consignado'::text, 'pix'::text, 'boleto'::text]))))`

Índices: `filiacao_recebe_bubble_id_key`, `filiacao_recebe_filiado_idx`, `filiacao_recebe_fonte_idx`, `filiacao_recebe_pkey`, `filiacao_recebe_remessa_cobertura_idx`, `filiacao_recebe_remessa_idx`, `idx_filiacao_recebe_filiado_raw`, `idx_filiacao_recebe_fonte_pg_raw`, `idx_filiacao_recebe_grupo`, `idx_filiacao_recebe_remessa_raw`

## filiacao_recebe_comprovacao

Comprovantes de repasse das contribuições pela fonte pagadora em cada remessa (data, valor, arquivo), usados na conciliação de Receitas. Migrado do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `data` | timestamp with time zone | sim |  |  |  |  |
| `valor` | numeric(15,2) | sim |  |  |  |  |
| `comprovante` | text | sim |  |  |  | Arquivo do comprovante de pagamento da fonte (pessoa jurídica). |
| `fonte_pg_id` | uuid | sim |  | → empresa |  |  |
| `fonte_pg_raw` | text | sim |  |  |  |  |
| `remessa_id` | uuid | sim |  | → filiacao_recebe_remessa |  |  |
| `remessa_raw` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` |  |  |  |
| `created_at` | timestamp with time zone | sim |  |  |  |  |
| `modified_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `filiacao_recebe_comprovacao_bubble_id_key`, `filiacao_recebe_comprovacao_pkey`

## filiacao_recebe_remessa

Remessas de contribuições por fonte pagadora e competência (ano/mês), agrupando as linhas de filiacao_recebe. Migrado do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `aberto` | boolean | sim |  |  |  | Remessa ainda aberta para importação/ajustes. |
| `ano` | text | sim |  |  |  |  |
| `mes` | text | sim |  |  |  |  |
| `ordem` | integer | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  |  |
| `emp_contratante_id` | uuid | sim |  | → empresa |  | Fonte pagadora (empregador ou fundo) da remessa. |
| `emp_contratante_raw` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` |  |  |  |
| `created_at` | timestamp with time zone | sim |  |  |  |  |
| `modified_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `filiacao_recebe_remessa_bubble_id_key`, `filiacao_recebe_remessa_pkey`

## filiacao_reembolsos

Reembolsos pagos ao filiado — desconto salarial de greve, cobrança indevida, despesa em atividade sindical —, com tipo, justificativa, projeto e ordem de pagamento. Migrado do Bubble (histórico do ACT).

- **LGPD:** financeiro, **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes (set null) |  |  |
| `data` | date | sim |  |  |  |  |
| `justificativa` | text | sim |  |  | **sensível: sindical** | Motivo do reembolso; revela participação em atividade sindical. |
| `valor` | numeric(12,2) | sim |  |  | financeiro |  |
| `ordem_pagamento_id` | uuid | sim |  | → ordens_pagamento (set null) |  |  |
| `projeto_id` | uuid | sim |  | → projeto (set null) |  |  |
| `prontuario_id` | uuid | sim |  | → filiacao_prontuario (set null) |  |  |
| `pagamento_indevido_id` | uuid | sim |  | → filiacao_recebe (set null) |  | Registro de pagamento indevido associado, quando houver. |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `tipo` | text | não | `'outro'::text` |  | **sensível: sindical** | Natureza do reembolso: desconto_greve, despesa_atividade, cobranca_indevida ou outro; o histórico foi classificado pelo texto da justificativa. |

Checks: `filiacao_reembolsos_tipo_check` `CHECK ((tipo = ANY (ARRAY['desconto_greve'::text, 'despesa_atividade'::text, 'cobranca_indevida'::text, 'outro'::text])))`

Índices: `filiacao_reembolsos_pkey`, `ix_filiacao_reembolsos_filiado`, `ix_filiacao_reembolsos_tipo`, `ux_filiacao_reembolsos_bubble`

## filiacao_reembolsos_config

Configuração dos reembolsos a filiados: valor padrão, centro de custo e orçamento mensal limite.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `centro_custo_id` | uuid | sim |  | → centros_de_custo (set null) |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `filiacao_reembolsos_config_pkey`, `ux_filiacao_reembolsos_config`

## filiacao_registro

Registro de filiação com CPF, nome, sexo, matrícula e condição sindical. Sem uso encontrado no código (possível legado do Bubble, substituído por filiacoes).

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nome` | text | sim |  |  | identificação |  |
| `nome_social` | text | sim |  |  | identificação |  |
| `sexo` | sexo_enum | sim |  |  | identificação |  |
| `matricula_sindical` | text | sim |  |  | **sensível: sindical** |  |
| `matricula_sindical_n` | integer | sim |  |  | **sensível: sindical** |  |
| `condicao_sindical` | filiacao_condicao_enum | sim |  |  | **sensível: sindical** |  |
| `sindicato_id` | uuid | sim |  | → empresa |  |  |
| `endereco_id` | uuid | sim |  | → enderecos |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `filiacao_registro_bubble_id_key`, `filiacao_registro_pkey`

## filiacao_solicitacao_eventos

Trilha de eventos de cada solicitação de filiação pela ficha pública (criada, código enviado, e-mail verificado, assinada, avaliada...), com IP e navegador.

- **LGPD:** **sensível: sindical**, identificação · titulares: público externo (candidatos à filiação)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `solicitacao_id` | uuid | sim |  | → filiacao_solicitacoes (**cascade**) |  |  |
| `evento` | text | sim |  |  | **sensível: sindical** |  |
| `detalhe` | text | sim |  |  | **sensível: sindical** |  |
| `ip` | text | sim |  |  | identificação |  |
| `user_agent` | text | sim |  |  | identificação |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `filiacao_solicitacao_eventos_pkey`, `idx_filiacao_solicitacao_eventos_solicitacao`

## filiacao_solicitacoes

Solicitações de filiação feitas pela ficha pública (/filiar) sem login: dados pessoais, vínculo, aceites LGPD e de desconto, verificação de e-mail, documento assinado (gov.br) e avaliação pela secretaria.

- **LGPD:** **sensível: sindical**, identificação, trabalhista, **credencial (nunca exportar)** · titulares: público externo (candidatos à filiação)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `token` | uuid | não | `gen_random_uuid()` |  | **credencial (nunca exportar)** | Token do link de acompanhamento da solicitação. |
| `nome_completo` | text | sim |  |  | identificação |  |
| `nome_completo_norm` | text | sim | `f_unaccent(lower(nome_completo))` |  | identificação |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nascimento_data` | date | sim |  |  | identificação |  |
| `sexo` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `telefone_1` | text | sim |  |  | identificação |  |
| `telefone_1_whatsapp` | boolean | não | `false` |  |  |  |
| `telefone_2` | text | sim |  |  | identificação |  |
| `endereco_cep` | text | sim |  |  | identificação |  |
| `endereco_logradouro` | text | sim |  |  | identificação |  |
| `endereco_numero` | text | sim |  |  | identificação |  |
| `endereco_complemento` | text | sim |  |  | identificação |  |
| `endereco_bairro` | text | sim |  |  | identificação |  |
| `endereco_cidade` | text | sim |  |  | identificação |  |
| `endereco_estado` | text | sim |  |  | identificação |  |
| `empregador_id` | uuid | sim |  | → empresa | trabalhista |  |
| `matricula` | text | sim |  |  | trabalhista |  |
| `cargo` | text | sim |  |  | trabalhista |  |
| `lotacao` | text | sim |  |  | trabalhista |  |
| `aceite_lgpd_data` | timestamp with time zone | sim |  |  | **sensível: sindical** |  |
| `aceite_desconto_data` | timestamp with time zone | sim |  |  | **sensível: sindical** | Autorização do desconto da contribuição em folha. |
| `codigo_hash` | text | sim |  |  | **credencial (nunca exportar)** | Hash do código de verificação enviado por e-mail. |
| `codigo_expira_em` | timestamp with time zone | sim |  |  |  | Validade do código de verificação. |
| `codigo_tentativas` | integer | não | `0` |  |  | Tentativas de digitar o código. |
| `email_verificado_em` | timestamp with time zone | sim |  |  |  |  |
| `situacao` | text | não | `'aguardando_verificacao'::text` |  | **sensível: sindical** |  |
| `documento_assinado_url` | text | sim |  |  | **sensível: sindical** | Ficha de filiação assinada (PDF). |
| `protocolo` | integer | sim |  |  |  |  |
| `filiacao_id` | uuid | sim |  | → filiacoes |  |  |
| `avaliacao` | boolean | sim |  |  |  |  |
| `avaliacao_data` | date | sim |  |  |  |  |
| `avaliacao_avaliador_id` | uuid | sim |  | → usuarios |  |  |
| `reprovacao_motivo` | text | sim |  |  | **sensível: sindical** |  |
| `ip` | text | sim |  |  | identificação |  |
| `user_agent` | text | sim |  |  | identificação |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `nome_social` | text | sim |  |  | identificação |  |
| `tl_lgpd_id` | uuid | sim |  | → filiacao_tl_lgpd |  |  |
| `tl_desconto_id` | uuid | sim |  | → filiacao_tl_desconto |  |  |
| `assinatura_validacao` | jsonb | sim |  |  | identificação | Resultado da validação PAdES do PDF assinado (lib/assinatura-pdf.ts). |

Checks: `filiacao_solicitacoes_situacao_check` `CHECK ((situacao = ANY (ARRAY['aguardando_verificacao'::text, 'aguardando_assinatura'::text, 'nao_avaliada'::text, 'aprovada'::text, 'reprovada'::text, 'desistente'::text])))`

Índices: `filiacao_solicitacoes_pkey`, `idx_filiacao_solicitacoes_cpf`, `idx_filiacao_solicitacoes_emp`, `idx_filiacao_solicitacoes_nome_norm_trgm`, `idx_filiacao_solicitacoes_situacao`, `idx_filiacao_solicitacoes_token`

## filiacao_suspensoes

Dispensas concedidas a um filiado (por CPF) da regra de carência ou de inadimplência, total ou para um benefício, com vigência, motivo e revogação.

- **LGPD:** **sensível: sindical**, financeiro, identificação · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `escopo` | text | sim |  |  | financeiro | carencia ou inadimplencia. |
| `alvo` | text | sim |  |  |  | Benefício a que a dispensa se aplica (ou todos). |
| `motivo` | text | sim |  |  | financeiro |  |
| `vigencia_ate` | date | sim |  |  |  |  |
| `concedida_por` | uuid | sim |  | → usuarios |  |  |
| `revogada_em` | timestamp with time zone | sim |  |  |  |  |
| `revogada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `ck_filiacao_suspensoes_escopo` `CHECK ((escopo = ANY (ARRAY['carencia'::text, 'inadimplencia'::text]))) NOT VALID`

Índices: `filiacao_suspensoes_pkey`, `idx_filiacao_suspensoes_cpf`

## filiacao_tl_aceites

Registro de cada aceite de termo (LGPD ou autorização de desconto) pelo filiado, com versão do termo, origem (portal, ficha pública, secretaria), IP e navegador. Prova do consentimento.

- **LGPD:** **sensível: sindical**, identificação · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `filiacao_id` | uuid | sim |  | → filiacoes (set null) |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `tipo` | text | não |  |  | **sensível: sindical** | lgpd ou desconto. |
| `termo_id` | uuid | sim |  |  |  |  |
| `origem` | text | não |  |  |  |  |
| `ip` | text | sim |  |  | identificação |  |
| `user_agent` | text | sim |  |  | identificação |  |
| `aceito_em` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `filiacao_tl_aceites_origem_check` `CHECK ((origem = ANY (ARRAY['portal'::text, 'ficha_publica'::text, 'secretaria'::text])))`; `filiacao_tl_aceites_tipo_check` `CHECK ((tipo = ANY (ARRAY['lgpd'::text, 'desconto'::text])))`

Índices: `filiacao_tl_aceites_cpf_idx`, `filiacao_tl_aceites_pkey`

## filiacao_tl_desconto

Versões do termo de autorização de desconto da contribuição em folha, exibido na ficha de filiação pública. Origem Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `texto` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `em_vigor` | boolean | sim | `false` |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `filiacao_tl_desconto_bubble_id_key`, `filiacao_tl_desconto_pkey`, `idx_filiacao_tl_desconto_emp`

## filiacao_tl_lgpd

Versões do termo de consentimento LGPD exibido na ficha de filiação pública. Origem Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `texto` | text | sim |  |  |  |  |
| `em_vigor` | boolean | sim | `false` |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `filiacao_tl_lgpd_bubble_id_key`, `filiacao_tl_lgpd_pkey`, `idx_filiacao_tl_lgpd_emp`

## filiacao_vinculos

Vínculos do filiado com cada fonte pagadora (empregador ou fundo de pensão): matrícula, cargo, lotação, admissão/demissão, datas e documentos de filiação e desfiliação. Migrado e reconstruído do Bubble.

- **LGPD:** **sensível: sindical**, trabalhista, identificação · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes |  |  |
| `cargo` | text | sim |  |  | trabalhista |  |
| `lotacao` | text | sim |  |  | trabalhista |  |
| `matricula` | text | sim |  |  | trabalhista |  |
| `data_entrada_admissao` | date | sim |  |  | trabalhista |  |
| `data_saida_demissao` | date | sim |  |  | trabalhista |  |
| `data_filiacao` | date | sim |  |  | **sensível: sindical** |  |
| `data_desfiliacao` | date | sim |  |  | **sensível: sindical** |  |
| `ficha_filiacao` | text | sim |  |  | **sensível: sindical** | Arquivo da ficha de filiação assinada. |
| `ficha_filiacao_aceita` | boolean | sim | `false` |  | **sensível: sindical** |  |
| `carta_desfiliacao` | text | sim |  |  | **sensível: sindical** | Arquivo da carta de desfiliação. |
| `carta_desfiliacao_aceita` | boolean | sim | `false` |  | **sensível: sindical** |  |
| `fonte_pagadora_id` | uuid | sim |  | → empresa |  |  |
| `filiacao_vinculada_id` | uuid | sim |  | → filiacoes |  | Vínculo de origem quando o vínculo deriva de outro (ex.: pensionista de titular). |
| `filiacao_vinculada_tipo` | text | sim |  |  |  | Tipo da relação com o vínculo de origem. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `filiacao_data_adesao` | date | sim |  |  | **sensível: sindical** |  |
| `filiacao_data_saida` | date | sim |  |  | **sensível: sindical** |  |
| `filiacao_desfiliacao_carta` | text | sim |  |  | **sensível: sindical** |  |
| `filiacao_desfiliacao_comprovante` | text | sim |  |  | **sensível: sindical** |  |
| `filiacao_ficha` | text | sim |  |  | **sensível: sindical** |  |
| `filiacao_coletiva` | boolean | sim | `false` |  | **sensível: sindical** | Filiado por lote de filiação coletiva. |
| `fonte_pg_cargo` | text | sim |  |  | trabalhista | Cargo como informado pela fonte pagadora. |
| `fonte_pg_matricula` | text | sim |  |  | trabalhista |  |
| `fonte_pg_admissao` | date | sim |  |  | trabalhista |  |
| `fonte_pg_demissao` | date | sim |  |  | trabalhista |  |
| `fonte_pg_lotacao` | text | sim |  |  | trabalhista |  |
| `fonte_pg_regime` | text | sim |  |  | trabalhista |  |
| `slug` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `regime_trabalho` | text | sim |  |  | trabalhista |  |
| `reconstruido_de` | text | sim |  |  |  | Id do cadastro no Bubble de onde este vínculo foi derivado. Nulo = vínculo registrado normalmente. |
| `lotacao_offshore` | boolean | sim |  |  | trabalhista |  |
| `condicao_na_fonte` | text | sim |  |  | trabalhista | Condição do filiado nesta fonte pagadora: Trabalhador(a) da ativa \| Beneficiário(a) aposentado(a) \| Beneficiário(a) pensionista. |
| `desfiliacao_motivo` | text | sim |  |  | **sensível: sindical** | Motivo da desfiliação neste vínculo, em lista fechada (lib/churn-constantes.ts). |
| `desfiliacao_motivo_detalhe` | text | sim |  |  | **sensível: sindical** | Complemento livre do motivo da desfiliação neste vínculo. |

Únicas: `UNIQUE (bubble_id)`

Índices: `filiacao_vinculos_bubble_id_key`, `filiacao_vinculos_desfiliacao_motivo_idx`, `filiacao_vinculos_filiado_idx`, `filiacao_vinculos_fonte_idx`, `filiacao_vinculos_fonte_pg_matricula_busca_idx`, `filiacao_vinculos_matricula_busca_idx`, `filiacao_vinculos_pkey`, `filiacao_vinculos_reconstruido_idx`, `idx_filiacao_vinculos_condicao_fonte`

## filiacoes

Cadastro do filiado (ou ex-filiado/não filiado) na entidade: identificação, contato, endereço, condição de filiação, fonte pagadora e contribuição. Tabela central de Filiação, migrada do Bubble; a existência do registro revela a relação sindical.

- **LGPD:** identificação, **sensível: sindical**, trabalhista, financeiro, **credencial (nunca exportar)** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `filiacoes_nascimento_dia_mes` → `filiacoes_nascimento_dia_mes`, `set_emp_from_jwt` → `set_emp_from_jwt`, `trg_filiacoes_updated_at` → `set_updated_at`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nome_completo` | text | sim |  |  | identificação |  |
| `nome_social` | text | sim |  |  | identificação |  |
| `foto` | text | sim |  |  | identificação |  |
| `sexo` | sexo_enum | sim |  |  | identificação |  |
| `nascimento_data` | date | sim |  |  | identificação |  |
| `nascimento_dia` | integer | sim |  |  | identificação |  |
| `nascimento_mes` | integer | sim |  |  | identificação |  |
| `telefone_1` | text | sim |  |  | identificação |  |
| `telefone_1_whatsapp` | boolean | sim | `false` |  |  |  |
| `telefone_2` | text | sim |  |  | identificação |  |
| `telefone_2_whatsapp` | boolean | sim | `false` |  |  |  |
| `email_pessoal` | text | sim |  |  | identificação |  |
| `email_corporativo` | text | sim |  |  | identificação |  |
| `endereco_cep` | text | sim |  |  | identificação |  |
| `endereco_logradouro` | text | sim |  |  | identificação |  |
| `endereco_numero` | text | sim |  |  | identificação |  |
| `endereco_complemento` | text | sim |  |  | identificação |  |
| `endereco_bairro` | text | sim |  |  | identificação |  |
| `endereco_cidade` | text | sim |  |  | identificação |  |
| `endereco_estado` | text | sim |  |  | identificação |  |
| `matricula_sindical` | text | sim |  |  | **sensível: sindical** |  |
| `matricula_sindical_numero` | integer | sim |  |  | **sensível: sindical** |  |
| `filiacao_excluida` | boolean | sim | `false` |  | **sensível: sindical** |  |
| `valido` | boolean | sim | `true` |  | **sensível: sindical** | Cadastro de filiação válido (herança do Bubble). |
| `recebe_mensagens` | boolean | sim | `true` |  |  | Aceita receber comunicados. |
| `filiacao_lotacao` | text | sim |  |  | trabalhista |  |
| `filiacao_fonte_pg_admissao` | date | sim |  |  | trabalhista | Data de admissão na fonte pagadora (empregador). |
| `outra_filiacao_entidade` | text | sim |  |  | **sensível: sindical** | Outra entidade sindical à qual a pessoa era filiada. |
| `outra_filiacao_desfiliar` | boolean | sim | `false` |  | **sensível: sindical** |  |
| `tl_lgpd_data` | date | sim |  |  |  | Data de aceite do termo LGPD. |
| `tl_desconto_data` | date | sim |  |  | **sensível: sindical** | Data do termo de autorização de desconto da contribuição. |
| `codigo_verificacao` | text | sim |  |  | **credencial (nunca exportar)** | Código de verificação do Bubble; não exportar. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `outra_filiacao_desfiliada` | boolean | sim | `false` |  | **sensível: sindical** |  |
| `outra_filiacao_solicitacao` | text | sim |  |  | **sensível: sindical** | Pedido de desfiliação da outra entidade. |
| `sindicato_id` | uuid | sim |  | → empresa |  |  |
| `slug` | text | sim |  |  | identificação | Identificador legível do cadastro usado em URLs. |
| `tl_desconto_id` | uuid | sim |  | → filiacao_tl_desconto |  |  |
| `votoonline2026` | boolean | sim | `false` |  | **sensível: sindical** | Marca de participação/aptidão para a votação online de 2026. |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tl_lgpd_id` | uuid | sim |  | → filiacao_tl_lgpd |  |  |
| `filiacao_condicao` | text | sim |  |  | **sensível: sindical** | Situação de filiação (filiado, pendente, desfiliado etc.). |
| `anonimizada_em` | timestamp with time zone | sim |  |  |  | Quando os identificadores diretos foram destruídos. A linha permanece para preservar integridade referencial (16 tabelas apontam para cá), estatística e ocupação de matrícula. |
| `nome_completo_norm` | text | sim | `f_unaccent(lower(nome_completo))` |  | identificação | Nome sem acento e minúsculo, para busca. |
| `condicao_desde` | timestamp with time zone | sim |  |  | **sensível: sindical** |  |
| `ficha_assinada_em` | timestamp with time zone | sim |  |  | **sensível: sindical** |  |
| `filiacao_informada_fonte_em` | timestamp with time zone | sim |  |  | **sensível: sindical** | Quando a filiação foi comunicada à fonte pagadora. |
| `ativo_em` | timestamp with time zone | sim |  |  | **sensível: sindical** |  |
| `desfiliacao_informada_fonte_em` | timestamp with time zone | sim |  |  | **sensível: sindical** |  |
| `inativo_em` | timestamp with time zone | sim |  |  | **sensível: sindical** |  |
| `filiacao_coletiva_id` | uuid | sim |  | → filiacao_coletiva (set null) |  |  |
| `filiacao_coletiva_prazo` | date | sim |  |  | **sensível: sindical** |  |
| `filiacao_coletiva_em` | date | sim |  |  | **sensível: sindical** |  |
| `condicao_na_fonte` | text | sim |  |  | trabalhista | Situação da pessoa junto à fonte pagadora: Trabalhador(a) da ativa, Beneficiário(a) aposentado(a), Beneficiário(a) pensionista. |
| `fonte_pg_offshore` | boolean | sim |  |  | trabalhista | Trabalha embarcado (offshore). |
| `mesclado_em_id` | uuid | sim |  | → filiacoes |  | Cadastro que incorporou este (mesclagem de duplicidade). Este fica excluído; o histórico foi movido para lá. |
| `mesclado_em` | timestamp with time zone | sim |  |  |  |  |
| `mesclado_por` | uuid | sim |  | → usuarios |  |  |
| `forma_recebimento` | text | sim |  |  | financeiro | Como a entidade recebe a contribuição: consignado (desconto em folha), pix ou boleto. null = não informado. |
| `forma_recebimento_ordem` | integer | sim |  |  | financeiro | Competência (ano*100+mês) da remessa que definiu forma_recebimento. Importações mais antigas não sobrescrevem. |
| `comunicados_optout_em` | timestamp with time zone | sim |  |  |  |  |
| `comunicados_optout_origem` | text | sim |  |  |  | Por onde o filiado pediu para não receber comunicados. |
| `desfiliacao_motivo` | text | sim |  |  | **sensível: sindical** | OBSOLETO desde 27/10/2026: o motivo mora em filiacao_vinculos.desfiliacao_motivo. |
| `desfiliacao_motivo_detalhe` | text | sim |  |  | **sensível: sindical** | OBSOLETO desde 27/10/2026: ver filiacao_vinculos.desfiliacao_motivo_detalhe. |
| `contribuicao_valor` | numeric(12,2) | sim |  |  | financeiro | Valor da contribuição do filiado. |

Únicas: `UNIQUE (bubble_id)`

Checks: `filiacoes_forma_recebimento_check` `CHECK (((forma_recebimento IS NULL) OR (forma_recebimento = ANY (ARRAY['consignado'::text, 'pix'::text, 'boleto'::text]))))`

Índices: `filiacoes_anonimizada_idx`, `filiacoes_bubble_id_key`, `filiacoes_condicao_idx`, `filiacoes_cpf_idx`, `filiacoes_desfiliacao_motivo_idx`, `filiacoes_emp_ativo_em_idx`, `filiacoes_emp_inativo_em_idx`, `filiacoes_matricula_idx`, `filiacoes_nome_norm_trgm`, `filiacoes_pkey`, `idx_bub_filiacoes`, `idx_filiacoes_aniversario`, `idx_filiacoes_coletiva`, `idx_filiacoes_condicao_etapa`, `idx_filiacoes_cpf`, `idx_filiacoes_mesclado_em`, `idx_filiacoes_usuario`

## fonte_categorias

Categorias de fonte pagadora criadas pela entidade além de Empregador e Fundo de pensão; usadas na configuração da saúde dos cadastros.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | não | `''::text` |  |  |  |
| `base` | text | não | `'empregador'::text` |  |  | Categoria base em que se apoia (empregador ou fundo de pensão). |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `fonte_categorias_base_check` `CHECK ((base = ANY (ARRAY['empregador'::text, 'fundo_pensao'::text])))`

Índices: `fonte_categorias_pkey`, `uq_fonte_categorias_emp_nome`

## oposicao_campanha

Campanhas de oposição à contribuição assistencial: empresa, prazo, vídeos obrigatórios, modo de formalização e texto da declaração. Migrado do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `detalhe_desconto` | text | sim |  |  |  | Descrição do desconto ao qual se opõe. |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `prazo_inicio` | date | sim |  |  |  |  |
| `prazo_fim` | date | sim |  |  |  |  |
| `video_filiado_url` | text | sim |  |  |  |  |
| `video_filiado_tempo` | integer | sim |  |  |  |  |
| `video_nao_filiado_url` | text | sim |  |  |  |  |
| `video_nao_filiado_tempo` | integer | sim |  |  |  |  |
| `video_agradecimento_url` | text | sim |  |  |  |  |
| `modo_formalizacao` | text | não | `'tela'::text` |  |  | Como o opositor formaliza (declaração, documento assinado...). |
| `texto_declaracao` | text | sim |  |  |  |  |
| `documento_modelo_url` | text | sim |  |  |  |  |
| `situacao` | text | não | `'rascunho'::text` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `regra_carta_fora_prazo` | text | sim |  |  | nenhum | Decisão da campanha sobre carta depois do prazo; nula = padrão da entidade (oposicao_regras). Gravada ao abrir. |
| `regra_video_minimo` | text | sim |  |  | nenhum | Decisão da campanha sobre o vídeo com tempo mínimo; nula = padrão da entidade. |
| `regra_assinaturas_aceitas` | text | sim |  |  | nenhum | Assinaturas que a campanha aceita na carta; nula = padrão da entidade. |
| `regra_prova_nao_filiado` | text | sim |  |  | nenhum | Prova exigida do não filiado; nula = padrão da entidade. |
| `regra_segregacao` | text | sim |  |  | nenhum | Segregação de permissões da campanha; nula = padrão da entidade. |

Checks: `oposicao_campanha_modo_formalizacao_check` `CHECK ((modo_formalizacao = ANY (ARRAY['tela'::text, 'assinatura'::text, 'hibrido'::text])))`; `oposicao_campanha_regra_assinaturas_aceitas_check` `CHECK ((regra_assinaturas_aceitas = ANY (ARRAY['govbr'::text, 'govbr_icp'::text])))`; `oposicao_campanha_regra_carta_fora_prazo_check` `CHECK ((regra_carta_fora_prazo = ANY (ARRAY['aceitar'::text, 'recusar'::text])))`; `oposicao_campanha_regra_prova_nao_filiado_check` `CHECK ((regra_prova_nao_filiado = ANY (ARRAY['nenhuma'::text, 'matricula'::text, 'carta_govbr'::text])))`; `oposicao_campanha_regra_segregacao_check` `CHECK ((regra_segregacao = ANY (ARRAY['unica'::text, 'separada'::text])))`; `oposicao_campanha_regra_video_minimo_check` `CHECK ((regra_video_minimo = ANY (ARRAY['exigir'::text, 'dispensar'::text])))`; `oposicao_campanha_situacao_check` `CHECK ((situacao = ANY (ARRAY['rascunho'::text, 'aberta'::text, 'encerrada'::text])))`

Índices: `idx_oposicao_campanha_bubble`, `idx_oposicao_campanha_emp`, `oposicao_campanha_pkey`

## oposicao_campanha_fontes

Empresas (fontes pagadoras) abrangidas por cada campanha de oposição.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `campanha_id` | uuid | sim |  | → oposicao_campanha (**cascade**) |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (campanha_id, empresa_id)`

Índices: `idx_oposicao_campanha_fontes_campanha`, `oposicao_campanha_fontes_campanha_id_empresa_id_key`, `oposicao_campanha_fontes_pkey`

## oposicao_envios_empregador

Cada envio, a um empregador, da relação de oposições aprovadas de uma campanha: quem enviou, quando, por qual meio e quais oposições foram (snapshot). Só insere (27/10/2026).

- **LGPD:** identificação · titulares: opositores, usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `oposicao_envios_imutavel` → `oposicao_envios_imutavel`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `campanha_id` | uuid | não |  | → oposicao_campanha (restrict) |  |  |
| `empresa_id` | uuid | sim |  | → empresa (restrict) |  | Fonte pagadora que recebeu a relação; null = oposições sem fonte informada. |
| `enviado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `usuario_id` | uuid | sim |  |  | identificação | Quem registrou o envio. |
| `usuario_nome` | text | sim |  |  | identificação | Nome de quem registrou, no momento do envio. |
| `meio` | text | não |  |  |  | email, oficio, em_maos, sistema_rh ou outro. |
| `referencia` | text | sim |  |  |  | Número do ofício, protocolo do RH ou assunto do e-mail. |
| `observacao` | text | sim |  |  |  |  |
| `opositor_ids` | uuid[] | não | `'{}'::uuid[]` |  | identificação | Oposições que constavam da relação enviada (ids de oposicao_opositor). |
| `quantidade` | integer | não |  |  |  | Quantas oposições a relação levava. |

Checks: `oposicao_envios_empregador_meio_check` `CHECK ((meio = ANY (ARRAY['email'::text, 'oficio'::text, 'em_maos'::text, 'sistema_rh'::text, 'outro'::text])))`; `oposicao_envios_empregador_quantidade_check` `CHECK ((quantidade >= 0))`

Índices: `oposicao_envios_empregador_campanha_idx`, `oposicao_envios_empregador_pkey`

## oposicao_eventos

Trilha de eventos de cada carta de oposição (enviada, confirmada, avaliada, desistência...), com IP e navegador.

- **LGPD:** **sensível: sindical**, identificação · titulares: trabalhadores opositores (filiados ou não)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `oposicao_eventos_imutavel` → `oposicao_eventos_imutavel`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `opositor_id` | uuid | sim |  | → oposicao_opositor (restrict) |  |  |
| `evento` | text | sim |  |  | **sensível: sindical** |  |
| `detalhe` | text | sim |  |  | **sensível: sindical** |  |
| `ip` | text | sim |  |  | identificação |  |
| `user_agent` | text | sim |  |  | identificação |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios | identificação | Quem da entidade fez a ação (avaliação, edição da campanha); nulo = o próprio trabalhador ou o sistema. |
| `campanha_id` | uuid | sim |  | → oposicao_campanha (restrict) |  | Campanha do evento — preenchida nos eventos da campanha (edição, fontes, perguntas), em que opositor_id é nulo. |

Índices: `idx_oposicao_eventos_opositor`, `oposicao_eventos_campanha_idx`, `oposicao_eventos_pkey`

## oposicao_opositor

Cada trabalhador que se opôs à contribuição assistencial numa campanha: dados pessoais, vínculo, carta/documento assinado, avaliação e desistência. Migrado do Bubble; o empregador vê no painel do empregador.

- **LGPD:** **sensível: sindical**, identificação, trabalhista · titulares: trabalhadores opositores (filiados ou não)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nome_completo` | text | sim |  |  | identificação |  |
| `nome_social` | text | sim |  |  | identificação |  |
| `sexo` | sexo_enum | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `telefone` | text | sim |  |  | identificação |  |
| `empresa` | text | sim |  |  | trabalhista |  |
| `lotacao` | text | sim |  |  | trabalhista |  |
| `matricula` | text | sim |  |  | trabalhista |  |
| `nascimento` | date | sim |  |  | identificação |  |
| `carta` | text | sim |  |  | **sensível: sindical** | Carta de oposição. |
| `avaliacao` | boolean | sim | `false` |  | **sensível: sindical** |  |
| `avaliacao_data` | date | sim |  |  |  |  |
| `desistente` | boolean | sim | `false` |  | **sensível: sindical** |  |
| `avaliacao_avaliador_id` | uuid | sim |  | → usuarios |  |  |
| `endereco_id` | uuid | sim |  | → enderecos |  |  |
| `filiacao_id` | uuid | sim |  | → filiacoes |  |  |
| `empregador_id` | uuid | sim |  | → empresa |  |  |
| `oposicao_id` | uuid | sim |  |  |  | Referência legada do Bubble à oposição. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `campanha_id` | uuid | sim |  | → oposicao_campanha |  |  |
| `situacao` | text | sim |  |  | **sensível: sindical** |  |
| `protocolo` | integer | sim |  |  |  |  |
| `documento_assinado_url` | text | sim |  |  | **sensível: sindical** |  |
| `reprovacao_motivo` | text | sim |  |  | **sensível: sindical** |  |
| `ip` | text | sim |  |  | identificação |  |
| `user_agent` | text | sim |  |  | identificação |  |
| `confirmado_em` | timestamp with time zone | sim |  |  |  |  |
| `assinatura_validacao` | jsonb | sim |  |  | identificação | Validação PAdES; contém dados do certificado do signatário. |
| `cpf_digitos` | text | sim | `NULLIF(regexp_replace(COALESCE(cpf, ''::text), '\D'::text, ''::text, 'g'::text), ''::text)` |  | identificação | CPF só com dígitos (gerada de cpf): base da unicidade por campanha e da busca. |
| `declaracao_aceita` | text | sim |  |  | **sensível: sindical** | Texto da declaração exatamente como a pessoa aceitou ao confirmar (o comprovante e a carta usam este, não o atual da campanha). |
| `declaracao_hash` | text | sim |  |  |  | sha256 do texto aceito, para conferir que não mudou. |
| `modo_formalizacao_ato` | text | sim |  |  |  | Modo de formalização da campanha no momento da confirmação (tela, assinatura, híbrido). |
| `prazo_fim_ato` | date | sim |  |  |  | Fim do prazo da campanha no momento da confirmação. |
| `documento_enviado_em` | timestamp with time zone | sim |  |  | **sensível: sindical** | Quando chegou a primeira carta assinada (compara com o prazo na avaliação). |
| `aviso_avaliacao_pendente_em` | timestamp with time zone | sim |  |  | nenhum | Decisão tomada em lote cujo aviso ao trabalhador ainda não saiu; a rota /api/oposicao/tick envia aos poucos e volta a null. |

Únicas: `UNIQUE (bubble_id)`

Checks: `oposicao_opositor_situacao_check` `CHECK ((situacao = ANY (ARRAY['aguardando_documento'::text, 'nao_avaliada'::text, 'aprovada'::text, 'reprovada'::text, 'desistente'::text])))`

Índices: `idx_oposicao_opositor_campanha`, `idx_oposicao_opositor_cpf`, `idx_oposicao_opositor_emp`, `oposicao_opositor_aviso_pendente_idx`, `oposicao_opositor_bubble_id_key`, `oposicao_opositor_campanha_cpf_key`, `oposicao_opositor_campanha_protocolo_key`, `oposicao_opositor_campanha_situacao_idx`, `oposicao_opositor_pkey`

## oposicao_perguntas

Perguntas do questionário de cada campanha de oposição. Migrado do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `campanha_id` | uuid | sim |  | → oposicao_campanha (**cascade**) |  |  |
| `pergunta` | text | sim |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_oposicao_perguntas_campanha`, `oposicao_perguntas_pkey`

## oposicao_protocolos

Último protocolo emitido por campanha de oposição — contador atômico (oposicao_proximo_protocolo).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `campanha_id` | uuid | não |  | → oposicao_campanha (restrict) |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `ultimo` | integer | não |  |  |  |  |

Checks: `oposicao_protocolos_ultimo_check` `CHECK ((ultimo >= 0))`

Índices: `oposicao_protocolos_pkey`

## oposicao_regras

Decisões jurídicas padrão da entidade para as campanhas de oposição (carta fora do prazo, vídeo mínimo, assinaturas aceitas, prova do não filiado, segregação de permissões). Nulo = não decidido.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `carta_fora_prazo` | text | sim |  |  |  | aceitar: a carta assinada enviada depois do prazo é recebida e marcada no checklist; recusar: o portal não a recebe. |
| `video_minimo` | text | sim |  |  |  | exigir: o vídeo da campanha precisa ser assistido pelo tempo mínimo antes de confirmar; dispensar: o vídeo aparece, sem tempo mínimo. |
| `assinaturas_aceitas` | text | sim |  |  |  | govbr: só a assinatura do Assinador gov.br; govbr_icp: gov.br ou certificado ICP-Brasil (e-CPF). |
| `prova_nao_filiado` | text | sim |  |  |  | nenhuma: nome, CPF e e-mail confirmado; matricula: matrícula obrigatória; carta_govbr: carta assinada obrigatória para o não filiado. |
| `segregacao` | text | sim |  |  |  | unica: a permissão "oposicao" faz tudo; separada: configurar exige oposicao_configurar e avaliar exige oposicao_avaliar. |
| `definido_por` | uuid | sim |  |  | identificação | Quem salvou as decisões por último. |
| `definido_por_nome` | text | sim |  |  | identificação | Nome de quem salvou, no momento. |
| `atualizado_em` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `oposicao_regras_assinaturas_aceitas_check` `CHECK ((assinaturas_aceitas = ANY (ARRAY['govbr'::text, 'govbr_icp'::text])))`; `oposicao_regras_carta_fora_prazo_check` `CHECK ((carta_fora_prazo = ANY (ARRAY['aceitar'::text, 'recusar'::text])))`; `oposicao_regras_prova_nao_filiado_check` `CHECK ((prova_nao_filiado = ANY (ARRAY['nenhuma'::text, 'matricula'::text, 'carta_govbr'::text])))`; `oposicao_regras_segregacao_check` `CHECK ((segregacao = ANY (ARRAY['unica'::text, 'separada'::text])))`; `oposicao_regras_video_minimo_check` `CHECK ((video_minimo = ANY (ARRAY['exigir'::text, 'dispensar'::text])))`

Índices: `oposicao_regras_pkey`

## oposicao_resposta

Respostas do opositor às perguntas do questionário da campanha. Migrado do Bubble.

- **LGPD:** **sensível: sindical** · titulares: trabalhadores opositores (filiados ou não)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `opositor_id` | uuid | sim |  | → oposicao_opositor (**cascade**) |  |  |
| `pergunta_id` | uuid | sim |  | → oposicao_perguntas |  |  |
| `resposta` | text | sim |  |  | **sensível: sindical** | Pode revelar motivo e posição sobre a contribuição/sindicato. |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_oposicao_resposta_opositor`, `oposicao_resposta_pkey`

## portal_atendimentos

Atendimentos abertos pelo filiado no portal do associado (assunto, título, prazo, situação), ligados a uma demanda interna.

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `cpf` | text | não |  |  | identificação |  |
| `filiacao_id` | uuid | sim |  | → filiacoes (set null) |  |  |
| `nome` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `assunto` | text | não |  |  |  |  |
| `titulo` | text | não |  |  | identificação |  |
| `situacao` | text | não | `'aberta'::text` |  |  |  |
| `prazo` | date | sim |  |  |  |  |
| `demanda_id` | uuid | sim |  | → demandas (set null) |  |  |
| `primeira_resposta_em` | timestamp with time zone | sim |  |  |  |  |
| `concluida_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `portal_atendimentos_situacao_check` `CHECK ((situacao = ANY (ARRAY['aberta'::text, 'em_andamento'::text, 'respondida'::text, 'concluida'::text])))`

Índices: `portal_atendimentos_cpf_idx`, `portal_atendimentos_demanda_idx`, `portal_atendimentos_pkey`, `portal_atendimentos_situacao_idx`

## portal_atendimentos_mensagens

Mensagens trocadas entre filiado e entidade em cada atendimento do portal, com anexo opcional.

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados, funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `atendimento_id` | uuid | não |  | → portal_atendimentos (**cascade**) |  |  |
| `autor` | text | não |  |  |  | filiado ou entidade. |
| `autor_nome` | text | sim |  |  | identificação |  |
| `autor_usuario_id` | uuid | sim |  |  |  |  |
| `texto` | text | não |  |  | identificação | Texto livre; pode conter qualquer dado pessoal relatado pelo filiado. |
| `anexo_caminho` | text | sim |  |  | identificação |  |
| `anexo_nome` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `portal_atendimentos_mensagens_autor_check` `CHECK ((autor = ANY (ARRAY['filiado'::text, 'entidade'::text])))`

Índices: `portal_atendimentos_mensagens_idx`, `portal_atendimentos_mensagens_pkey`

## portal_avisos

Avisos (notificações) exibidos ao filiado no portal do associado, por CPF: evento, texto, link e data de leitura.

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `cpf` | text | não |  |  | identificação |  |
| `evento` | text | não |  |  |  | Tipo do aviso (votação, contribuição, evento...). |
| `texto` | text | não |  |  | **sensível: sindical** | Pode mencionar contribuição em atraso ou votação. |
| `link` | text | sim |  |  |  |  |
| `lida_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `portal_avisos_cpf_idx`, `portal_avisos_nao_lidos_idx`, `portal_avisos_pkey`

## portal_avisos_preferencias

Preferências do filiado (por CPF) sobre quais avisos do portal também chegam por e-mail.

- **LGPD:** identificação · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `emp_proprietaria_id` | uuid | não |  |  |  |  |
| 🔑 `cpf` | text | não |  |  | identificação |  |
| `email_prefs` | jsonb | sim |  |  |  | Mapa evento para boolean dos avisos por e-mail. |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `portal_avisos_preferencias_pkey`

## portal_nao_filiado

Cadastro mínimo de não filiados que entram no portal (ex.: para registrar oposição à contribuição).

- **LGPD:** identificação · titulares: público externo (trabalhadores não filiados)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nome` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `telefone` | text | sim |  |  | identificação |  |
| `nascimento` | date | sim |  |  | identificação |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, cpf)`

Índices: `portal_nao_filiado_emp_proprietaria_id_cpf_key`, `portal_nao_filiado_pkey`

## portal_partes

Área do associado: estado (habilitada/suspensa/desabilitada), aviso, retorno previsto e opções de cada parte do portal, por entidade. Sem linha = habilitada com as opções padrão.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `parte` | text | não |  |  |  |  |
| `estado` | text | não | `'habilitada'::text` |  |  |  |
| `mensagem` | text | sim |  |  |  |  |
| `retorno_previsto` | date | sim |  |  |  |  |
| `opcoes` | jsonb | não | `'{}'::jsonb` |  |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `portal_partes_estado_check` `CHECK ((estado = ANY (ARRAY['habilitada'::text, 'suspensa'::text, 'desabilitada'::text])))`

Índices: `portal_partes_pkey`, `ux_portal_partes_emp_parte`

## portal_push_assinaturas

Assinaturas Web Push do navegador/celular do filiado no portal, para envio de avisos.

- **LGPD:** identificação, **credencial (nunca exportar)** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `cpf` | text | não |  |  | identificação |  |
| `endpoint` | text | não |  |  | **credencial (nunca exportar)** | URL de entrega do push; quem a possui envia notificações ao aparelho. |
| `p256dh` | text | não |  |  | **credencial (nunca exportar)** | Chave pública de criptografia da assinatura push. |
| `auth` | text | não |  |  | **credencial (nunca exportar)** | Segredo de autenticação da assinatura push. |
| `user_agent` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `usado_em` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, endpoint)`

Checks: `portal_push_assinaturas_cpf_check` `CHECK ((cpf ~ '^[0-9]{11}$'::text))`

Índices: `portal_push_assinaturas_cpf_idx`, `portal_push_assinaturas_emp_endpoint_key`, `portal_push_assinaturas_pkey`

## registro_sindical

Registro da entidade no Ministério do Trabalho (número, categoria, abrangência, publicação, documento), tela Registro MTE (lib/db/registro-mte.ts).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `tipo` | text | não | `'registro_sindical'::text` |  |  |  |
| `numero` | text | sim |  |  |  |  |
| `categoria` | text | sim |  |  |  |  |
| `abrangencia` | text | sim |  |  |  |  |
| `data_registro` | date | sim |  |  |  |  |
| `data_publicacao` | date | sim |  |  |  |  |
| `situacao` | text | não | `'ativo'::text` |  |  |  |
| `documento_url` | text | sim |  |  |  |  |
| `observacoes` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `registro_sindical_situacao_check` `CHECK ((situacao = ANY (ARRAY['ativo'::text, 'em_analise'::text, 'cancelado'::text])))`; `registro_sindical_tipo_check` `CHECK ((tipo = ANY (ARRAY['registro_sindical'::text, 'cnes'::text, 'carta_sindical'::text])))`

Índices: `idx_registro_sindical_emp`, `registro_sindical_pkey`

## telefones

Telefones de usuários e filiados (vários por pessoa, com tipo, WhatsApp e favorito), migrados do Bubble.

- **LGPD:** identificação · titulares: filiados, usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `numero` | text | sim |  |  | identificação |  |
| `tipo` | text | sim |  |  |  |  |
| `whatsapp` | boolean | sim | `false` |  |  |  |
| `favorito` | boolean | sim | `false` |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `telefones_bubble_id_key`, `telefones_pkey`

## vinculos_trabalhistas

Vínculos empregatícios de pessoas (funcionários da entidade no módulo Pessoal e trabalhadores filiados): empregador, cargo, CBO, lotação, matrícula, regime, admissão e demissão. Migrado do Bubble.

- **LGPD:** trabalhista, identificação · titulares: funcionários, filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `trabalhador_id` | uuid | sim |  | → usuarios |  | Usuário trabalhador do vínculo. |
| `empregador_id` | uuid | sim |  | → empresa |  |  |
| `filiado_id` | uuid | sim |  | → filiacoes |  |  |
| `endereco_id` | uuid | sim |  | → enderecos |  |  |
| `cbo_numero` | text | sim |  |  | trabalhista |  |
| `cargo` | text | sim |  |  | trabalhista |  |
| `lotacao` | text | sim |  |  | trabalhista |  |
| `matricula` | text | sim |  |  | trabalhista |  |
| `email_corporativo` | text | sim |  |  | identificação |  |
| `regime_trabalho` | text | sim |  |  | trabalhista |  |
| `regime_trabalho_os` | text | sim |  |  | trabalhista |  |
| `contrato_trabalho` | text | sim |  |  | trabalhista | Arquivo ou tipo do contrato de trabalho. |
| `contrato_admissao` | date | sim |  |  | trabalhista |  |
| `contrato_demissao` | date | sim |  |  | trabalhista |  |
| `cipa_ou_ciplat` | boolean | sim | `false` |  | trabalhista | Integra CIPA/CIPLAT (estabilidade). |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_vinculos_empregador`, `idx_vinculos_trabalhador`, `vinculos_trabalhistas_bubble_id_key`, `vinculos_trabalhistas_empregador_idx`, `vinculos_trabalhistas_filiado_idx`, `vinculos_trabalhistas_pkey`
