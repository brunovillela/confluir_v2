<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Comunicação, eventos e avisos

29 tabelas. Diagrama: [er/comunicacao.md](../er/comunicacao.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [avisos_entregas](#avisos_entregas) | — | Registro de avisos externos já entregues (e-mail, Telegram, push) por usuário, evento e chave, para não repetir o mesmo aviso. Gravada por l… |
| [comunicacao_aniversario_config](#comunicacao_aniversario_config) | identificação | Configuração do envio automático de parabéns aos filiados aniversariantes, uma linha por tenant: texto do e-mail e do WhatsApp, hora de envi… |
| [comunicacao_aniversario_modelos](#comunicacao_aniversario_modelos) | — | Modelos alternativos de mensagem de aniversário, escolhidos por critérios do filiado (jsonb) em ordem de prioridade. Configurados em Comunic… |
| [comunicacao_canais](#comunicacao_canais) | — | Canais de publicação usados pelo assistente de redação (site, Instagram, WhatsApp etc.), com limite de caracteres e orientações de estilo pa… |
| [comunicacao_envios](#comunicacao_envios) | identificação, **sensível: sindical** | Cada destinatário de uma mensagem aos filiados: dados de contato copiados no envio, texto personalizado e situação do e-mail e do WhatsApp. … |
| [comunicacao_etiquetas_emissoes](#comunicacao_etiquetas_emissoes) | — | Registro de cada emissão de etiquetas Pimaco para os Correios: quem emitiu, modelo, lote, quantidade e recorte de filiados usado. Serve de t… |
| [comunicacao_fontes](#comunicacao_fontes) | — | Sites e feeds de notícias cadastrados como fonte para o resumo de notícias gerado por IA. |
| [comunicacao_links](#comunicacao_links) | — | Links da página pública tipo link na bio da entidade, com contagem de cliques. |
| [comunicacao_links_config](#comunicacao_links_config) | — | Configuração da página pública de links da entidade, uma por tenant: título, bio e se está publicada. |
| [comunicacao_mensagens](#comunicacao_mensagens) | — | Mensagens em massa aos filiados (e-mail e WhatsApp): texto, filtros do público, agendamento e situação. Cada destinatário fica em comunicaca… |
| [comunicacao_politica](#comunicacao_politica) | — | Política editorial da entidade usada pelo assistente de redação por IA: público e tom padrão, termos a evitar e assinatura. |
| [comunicacao_qrcodes](#comunicacao_qrcodes) | — | QR codes dinâmicos da entidade: slug curto que redireciona para a URL de destino, com contagem de leituras. |
| [comunicacao_resumo_config](#comunicacao_resumo_config) | — | Configuração do resumo automático de notícias por IA: frequência, horário, tamanho e prompt. |
| [comunicacao_resumos](#comunicacao_resumos) | — | Resumos de notícias gerados por IA a partir das fontes cadastradas, manual ou automaticamente. |
| [comunicacao_slides](#comunicacao_slides) | — | Slides (imagem ou vídeo) de um conjunto exibido nas TVs da entidade em /tv/slug, com período e duração de exibição. |
| [comunicacao_slides_conjuntos](#comunicacao_slides_conjuntos) | — | Conjuntos de slides para TV, cada um com endereço público /tv/slug, orientação, logo, relógio e faixa de notícias. |
| [comunicacao_textos](#comunicacao_textos) | identificação | Textos pedidos ao assistente de redação por IA: briefing (assunto, fatos, público, tom), texto gerado e final, e versões de ajuste. |
| [eventos](#eventos) | — | Eventos da entidade com inscrição pública: datas, lotação, regras de aprovação, foto, RSVP e cota de convidados. |
| [eventos_campos](#eventos_campos) | — | Campos extras do formulário de inscrição de um evento, definidos pela organização. |
| [eventos_config](#eventos_config) | — | Configuração dos eventos por tenant: modo e retenção da foto do inscrito e integração com o controle de acesso (catraca). |
| [eventos_dias](#eventos_dias) | — | Dias e horários de um evento de vários dias; a presença é registrada por dia. |
| [eventos_inscricao_respostas](#eventos_inscricao_respostas) | identificação | Respostas do inscrito aos campos extras do formulário do evento. |
| [eventos_inscricoes](#eventos_inscricoes) | identificação, **sensível: sindical**, **credencial (nunca exportar)** | Inscrições em eventos, de filiados ou convidados sem login: identificação, foto, consentimento LGPD, aprovação, RSVP, controle de acesso e a… |
| [eventos_presencas](#eventos_presencas) | identificação | Presença confirmada de um inscrito em um dia do evento, pela recepção, por QR code ou busca. |
| [eventos_termos](#eventos_termos) | — | Versões dos termos de consentimento exibidos na inscrição (participação e uso de foto); a inscrição guarda qual versão foi aceita. |
| [eventos_titular_sessao](#eventos_titular_sessao) | identificação, **credencial (nunca exportar)** | Sessões curtas do canal LGPD do convidado de evento: ele se identifica pelo e-mail, confirma por código e pode consultar ou anonimizar seus … |
| [noticias](#noticias) | — | Notícias publicadas para o painel/portal: manchete, texto e imagem. Origem Bubble. |
| [notificacoes](#notificacoes) | trabalhista, financeiro | Notificações do sino do painel por usuário, com texto, link e se já foi vista; pode apontar para marcação de ponto ou contracheque. Origem B… |
| [push_assinaturas](#push_assinaturas) | identificação, **credencial (nunca exportar)** | Assinaturas Web Push dos navegadores/celulares dos usuários para receber avisos do sistema. |

## avisos_entregas

Registro de avisos externos já entregues (e-mail, Telegram, push) por usuário, evento e chave, para não repetir o mesmo aviso. Gravada por lib/db/avisos.ts; o sino usa a tabela notificacoes.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `usuario_id` | uuid | não |  |  |  |  |
| `evento` | text | não |  |  |  | Tipo de aviso (lista de lib/telegram-eventos.ts). |
| `chave` | text | não |  |  |  | Chave de deduplicação, ex.: dia:AAAA-MM-DD ou id da pendência. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (usuario_id, evento, chave)`

Índices: `avisos_entregas_criado_idx`, `avisos_entregas_pkey`, `avisos_entregas_usuario_id_evento_chave_key`

## comunicacao_aniversario_config

Configuração do envio automático de parabéns aos filiados aniversariantes, uma linha por tenant: texto do e-mail e do WhatsApp, hora de envio, antecedências e e-mails da equipe avisados.

- **LGPD:** identificação · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `ativo` | boolean | não | `false` |  |  |  |
| `assunto` | text | sim |  |  |  |  |
| `mensagem` | text | sim |  |  |  |  |
| `texto_whatsapp` | text | sim |  |  |  |  |
| `atualizado_por` | uuid | sim |  | → usuarios |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `hora_envio` | smallint | não | `9` |  |  |  |
| `aviso_equipe_emails` | text | sim |  |  | identificação | E-mails da equipe que recebem o aviso prévio dos aniversariantes. |
| `parabens_antecedencia` | smallint | não | `0` |  |  | Dias de antecedência do envio dos parabéns. |
| `aviso_antecedencia` | smallint | não | `0` |  |  | Dias de antecedência do aviso à equipe. |

Checks: `comunicacao_aniversario_config_antecedencia_check` `CHECK (((parabens_antecedencia = ANY (ARRAY[0, 1])) AND (aviso_antecedencia = ANY (ARRAY[0, 1]))))`; `comunicacao_aniversario_config_hora_check` `CHECK (((hora_envio >= 0) AND (hora_envio <= 23)))`

Índices: `comunicacao_aniversario_config_pkey`, `ux_comunicacao_aniversario_config_emp`

## comunicacao_aniversario_modelos

Modelos alternativos de mensagem de aniversário, escolhidos por critérios do filiado (jsonb) em ordem de prioridade. Configurados em Comunicação > Aniversariantes.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `criterios` | jsonb | não | `'{}'::jsonb` |  |  | Filtros que decidem a quais aniversariantes o modelo se aplica. |
| `assunto` | text | sim |  |  |  |  |
| `mensagem` | text | sim |  |  |  |  |
| `texto_whatsapp` | text | sim |  |  |  |  |
| `atualizado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `comunicacao_aniversario_modelos_pkey`, `idx_comunicacao_aniversario_modelos_emp`

## comunicacao_canais

Canais de publicação usados pelo assistente de redação (site, Instagram, WhatsApp etc.), com limite de caracteres e orientações de estilo para a IA.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `limite_caracteres` | integer | sim |  |  |  |  |
| `orientacoes` | text | sim |  |  |  |  |
| `suporta_busca` | boolean | não | `false` |  |  | Canal indexado por buscadores; habilita otimização SEO no texto. |
| `ativo` | boolean | não | `true` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `comunicacao_canais_pkey`, `idx_comunicacao_canais_emp`, `ux_comunicacao_canais_nome`

## comunicacao_envios

Cada destinatário de uma mensagem aos filiados: dados de contato copiados no envio, texto personalizado e situação do e-mail e do WhatsApp. Gravada pelo módulo Mensagens aos filiados e pelos parabéns de aniversário.

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `mensagem_id` | uuid | sim |  | → comunicacao_mensagens (**cascade**) |  |  |
| `filiacao_id` | uuid | sim |  | → filiacoes (set null) |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `nome` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `telefone` | text | sim |  |  | identificação |  |
| `email_situacao` | text | não | `'pendente'::text` |  |  |  |
| `email_em` | timestamp with time zone | sim |  |  |  |  |
| `email_erro` | text | sim |  |  |  | Erro devolvido pelo SMTP no envio. |
| `whatsapp_em` | timestamp with time zone | sim |  |  |  |  |
| `whatsapp_por` | uuid | sim |  | → usuarios |  | Usuário que disparou o WhatsApp manualmente. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `assunto` | text | sim |  |  | identificação |  |
| `corpo` | text | sim |  |  | identificação | Texto já personalizado com dados do filiado. |
| `texto_whatsapp` | text | sim |  |  | identificação |  |
| `modelo_nome` | text | sim |  |  |  |  |

Checks: `comunicacao_envios_email_situacao_check` `CHECK ((email_situacao = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviado'::text, 'sem_email'::text, 'descadastrado'::text, 'duplicado'::text, 'falha'::text])))`

Índices: `comunicacao_envios_pkey`, `idx_comunicacao_envios_pendentes`, `ux_comunicacao_envios_mensagem_cpf`

## comunicacao_etiquetas_emissoes

Registro de cada emissão de etiquetas Pimaco para os Correios: quem emitiu, modelo, lote, quantidade e recorte de filiados usado. Serve de trilha de uso do endereço dos filiados.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `tipo` | text | sim |  |  |  |  |
| `modelo` | text | sim |  |  |  |  |
| `lote` | text | sim |  |  |  | Lote de folhas impresso quando a emissão é dividida. |
| `quantidade` | integer | não | `0` |  |  |  |
| `recorte` | text | sim |  |  |  | Descrição legível dos filtros de filiados usados na emissão. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `comunicacao_etiquetas_emissoes_pkey`, `idx_comunicacao_etiquetas_emissoes_emp`

## comunicacao_fontes

Sites e feeds de notícias cadastrados como fonte para o resumo de notícias gerado por IA.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `url` | text | não |  |  |  |  |
| `nome` | text | sim |  |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `comunicacao_fontes_pkey`, `idx_comunicacao_fontes_emp`

## comunicacao_links

Links da página pública tipo link na bio da entidade, com contagem de cliques.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `titulo` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `url` | text | sim |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `cliques` | integer | não | `0` |  |  |  |
| `ultimo_clique` | timestamp with time zone | sim |  |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `comunicacao_links_pkey`, `idx_comunicacao_links_emp`

## comunicacao_links_config

Configuração da página pública de links da entidade, uma por tenant: título, bio e se está publicada.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `titulo` | text | sim |  |  |  |  |
| `bio` | text | sim |  |  |  |  |
| `publicada` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `comunicacao_links_config_pkey`, `ux_comunicacao_links_config_emp`

## comunicacao_mensagens

Mensagens em massa aos filiados (e-mail e WhatsApp): texto, filtros do público, agendamento e situação. Cada destinatário fica em comunicacao_envios.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tipo` | text | não | `'mala_direta'::text` |  |  |  |
| `referencia` | date | sim |  |  |  | Data de referência, ex.: dia dos aniversariantes. |
| `titulo` | text | sim |  |  |  |  |
| `assunto` | text | sim |  |  |  |  |
| `corpo` | text | sim |  |  |  |  |
| `texto_whatsapp` | text | sim |  |  |  |  |
| `filtros` | jsonb | sim |  |  |  | Filtros de filiados que definem o público da mensagem. |
| `recorte` | text | sim |  |  |  | Descrição legível dos filtros. |
| `situacao` | text | não | `'rascunho'::text` |  |  |  |
| `agendada_para` | date | sim |  |  |  |  |
| `enviada_em` | timestamp with time zone | sim |  |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `atualizado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `agendada_hora` | smallint | não | `9` |  |  |  |
| `aviso_equipe_em` | timestamp with time zone | sim |  |  |  | Quando a equipe foi avisada do envio agendado. |

Checks: `comunicacao_mensagens_situacao_check` `CHECK ((situacao = ANY (ARRAY['rascunho'::text, 'agendada'::text, 'enviando'::text, 'enviada'::text, 'cancelada'::text])))`; `comunicacao_mensagens_tipo_check` `CHECK ((tipo = ANY (ARRAY['aniversario'::text, 'mala_direta'::text])))`

Índices: `comunicacao_mensagens_pkey`, `idx_comunicacao_mensagens_emp`, `ux_comunicacao_mensagens_aniversario`

## comunicacao_politica

Política editorial da entidade usada pelo assistente de redação por IA: público e tom padrão, termos a evitar e assinatura.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `politica` | text | sim |  |  |  |  |
| `publico_padrao` | text | sim |  |  |  |  |
| `tom_padrao` | text | sim |  |  |  |  |
| `termos_evitar` | text | sim |  |  |  |  |
| `assinatura` | text | sim |  |  |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `comunicacao_politica_pkey`, `ux_comunicacao_politica_emp`

## comunicacao_qrcodes

QR codes dinâmicos da entidade: slug curto que redireciona para a URL de destino, com contagem de leituras.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `slug` | text | sim |  |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `finalidade` | text | sim |  |  |  |  |
| `destino_url` | text | sim |  |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `leituras` | integer | não | `0` |  |  |  |
| `ultima_leitura` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Índices: `comunicacao_qrcodes_pkey`, `idx_comunicacao_qrcodes_emp`, `ux_comunicacao_qrcodes_slug`

## comunicacao_resumo_config

Configuração do resumo automático de notícias por IA: frequência, horário, tamanho e prompt.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `ativo` | boolean | não | `false` |  |  |  |
| `frequencia` | text | não | `'diaria'::text` |  |  |  |
| `hora` | time without time zone | sim |  |  |  |  |
| `dia_semana` | integer | sim |  |  |  |  |
| `intervalo_horas` | integer | sim |  |  |  |  |
| `tamanho` | integer | não | `2000` |  |  |  |
| `prompt` | text | sim |  |  |  |  |
| `ultima_geracao` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id)`

Checks: `comunicacao_resumo_config_dia_semana_check` `CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))`; `comunicacao_resumo_config_frequencia_check` `CHECK ((frequencia = ANY (ARRAY['diaria'::text, 'dias_uteis'::text, 'semanal'::text, 'horas'::text])))`; `comunicacao_resumo_config_tamanho_check` `CHECK ((tamanho = ANY (ARRAY[1000, 2000, 3000])))`

Índices: `comunicacao_resumo_config_emp_proprietaria_id_key`, `comunicacao_resumo_config_pkey`

## comunicacao_resumos

Resumos de notícias gerados por IA a partir das fontes cadastradas, manual ou automaticamente.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `titulo` | text | sim |  |  |  |  |
| `resumo` | text | sim |  |  |  |  |
| `tamanho` | integer | sim |  |  |  |  |
| `origem` | text | sim |  |  |  | Se o resumo foi gerado manualmente ou pelo agendamento. |
| `fontes_url` | text[] | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `comunicacao_resumos_origem_check` `CHECK ((origem = ANY (ARRAY['manual'::text, 'agendador'::text])))`

Índices: `comunicacao_resumos_pkey`, `idx_comunicacao_resumos_emp`

## comunicacao_slides

Slides (imagem ou vídeo) de um conjunto exibido nas TVs da entidade em /tv/slug, com período e duração de exibição.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `conjunto_id` | uuid | sim |  | → comunicacao_slides_conjuntos (**cascade**) |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `imagem_caminho` | text | sim |  |  |  |  |
| `imagem_url` | text | sim |  |  |  |  |
| `ajuste` | text | não | `'cobrir'::text` |  |  | Como a imagem preenche a tela (cobrir ou conter). |
| `duracao_segundos` | integer | sim |  |  |  |  |
| `exibir_de` | date | sim |  |  |  |  |
| `exibir_ate` | date | sim |  |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `video_caminho` | text | sim |  |  |  |  |
| `video_url` | text | sim |  |  |  |  |
| `video_duracao_segundos` | integer | sim |  |  |  |  |
| `video_som` | boolean | não | `false` |  |  |  |

Checks: `ck_slides_ajuste` `CHECK ((ajuste = ANY (ARRAY['cobrir'::text, 'conter'::text])))`; `ck_slides_video_duracao` `CHECK (((video_duracao_segundos IS NULL) OR (video_duracao_segundos > 0)))`

Índices: `comunicacao_slides_pkey`, `idx_comunicacao_slides_conjunto`

## comunicacao_slides_conjuntos

Conjuntos de slides para TV, cada um com endereço público /tv/slug, orientação, logo, relógio e faixa de notícias.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | sim |  |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `orientacao` | text | não | `'horizontal'::text` |  |  |  |
| `girar` | text | não | `'nao'::text` |  |  | Rotação aplicada à tela para TVs montadas na vertical. |
| `duracao_segundos` | integer | não | `10` |  |  |  |
| `mostrar_logo` | boolean | não | `true` |  |  |  |
| `opacidade_logo` | integer | não | `70` |  |  |  |
| `faixa_ativa` | boolean | não | `true` |  |  |  |
| `faixa_noticias` | boolean | não | `true` |  |  | Faixa inferior mostra manchetes do resumo de notícias. |
| `faixa_quantidade` | integer | não | `8` |  |  |  |
| `faixa_texto` | text | sim |  |  |  |  |
| `mostrar_relogio` | boolean | não | `true` |  |  |  |
| `publicado` | boolean | não | `true` |  |  |  |
| `ultimo_acesso` | timestamp with time zone | sim |  |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_slides_conjuntos_girar` `CHECK ((girar = ANY (ARRAY['nao'::text, 'horario'::text, 'anti_horario'::text])))`; `ck_slides_conjuntos_orientacao` `CHECK ((orientacao = ANY (ARRAY['horizontal'::text, 'vertical'::text])))`

Índices: `comunicacao_slides_conjuntos_pkey`, `ux_comunicacao_slides_conjuntos_slug`

## comunicacao_textos

Textos pedidos ao assistente de redação por IA: briefing (assunto, fatos, público, tom), texto gerado e final, e versões de ajuste.

- **LGPD:** identificação · titulares: público externo
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `assunto` | text | sim |  |  |  |  |
| `objetivo` | text | sim |  |  |  |  |
| `canal_id` | uuid | sim |  | → comunicacao_canais |  |  |
| `canal_nome` | text | sim |  |  |  |  |
| `tamanho` | integer | sim |  |  |  |  |
| `fatos` | text | sim |  |  | identificação | Texto livre do briefing; pode citar pessoas. |
| `publico` | text | sim |  |  |  |  |
| `tom` | text | sim |  |  |  |  |
| `chamada_acao` | text | sim |  |  |  |  |
| `restricoes` | text | sim |  |  |  |  |
| `palavras_chave` | text | sim |  |  |  |  |
| `otimizar_busca` | boolean | não | `false` |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `texto_gerado` | text | sim |  |  | identificação |  |
| `texto_final` | text | sim |  |  | identificação |  |
| `caracteres` | integer | sim |  |  |  |  |
| `meta_descricao` | text | sim |  |  |  |  |
| `slug_sugerido` | text | sim |  |  |  |  |
| `hashtags` | text | sim |  |  |  |  |
| `versao` | integer | não | `1` |  |  |  |
| `origem_id` | uuid | sim |  | → comunicacao_textos |  | Versão anterior da qual esta foi ajustada. |
| `ajuste_pedido` | text | sim |  |  |  |  |
| `solicitado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_comunicacao_textos_fatos` `CHECK (((fatos IS NOT NULL) AND (length(btrim(fatos)) >= 20))) NOT VALID`

Índices: `comunicacao_textos_pkey`, `idx_comunicacao_textos_emp`, `idx_comunicacao_textos_origem`

## eventos

Eventos da entidade com inscrição pública: datas, lotação, regras de aprovação, foto, RSVP e cota de convidados.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `slug` | text | sim |  |  |  |  |
| `titulo` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `card_url` | text | sim |  |  |  |  |
| `local` | text | sim |  |  |  |  |
| `endereco` | text | sim |  |  |  |  |
| `inicio` | timestamp with time zone | sim |  |  |  |  |
| `termino` | timestamp with time zone | sim |  |  |  |  |
| `lotacao_maxima` | integer | sim |  |  |  |  |
| `overbooking_percentual` | numeric | não | `0` |  |  | Percentual de inscrições aceitas acima da lotação. |
| `inscricoes_abrem_em` | timestamp with time zone | sim |  |  |  |  |
| `inscricoes_fecham_em` | timestamp with time zone | sim |  |  |  |  |
| `limite_inscricoes` | integer | sim |  |  |  |  |
| `exige_aprovacao` | boolean | não | `false` |  |  |  |
| `confirma_filiado_automatico` | boolean | não | `true` |  |  |  |
| `exige_foto` | boolean | não | `false` |  |  |  |
| `exige_rsvp` | boolean | não | `false` |  |  | Pede confirmação de presença por link antes do evento. |
| `situacao` | text | não | `'rascunho'::text` |  |  |  |
| `adiado_para` | timestamp with time zone | sim |  |  |  |  |
| `motivo_situacao` | text | sim |  |  |  |  |
| `situacao_em` | timestamp with time zone | sim |  |  |  |  |
| `agenda_id` | uuid | sim |  | → agenda |  |  |
| `criado_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `cota_convidados` | integer | sim |  |  |  | Quantos convidados cada filiado pode inscrever. |
| `rsvp_abre_em` | timestamp with time zone | sim |  |  |  |  |
| `rsvp_enviado_lote_em` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_eventos_cota_convidados` `CHECK (((cota_convidados IS NULL) OR (cota_convidados >= 0))) NOT VALID`; `ck_eventos_overbooking` `CHECK (((overbooking_percentual >= (0)::numeric) AND (overbooking_percentual <= (100)::numeric))) NOT VALID`; `ck_eventos_situacao` `CHECK ((situacao = ANY (ARRAY['rascunho'::text, 'publicado'::text, 'encerrado'::text, 'cancelado'::text, 'adiado'::text]))) NOT VALID`

Índices: `eventos_pkey`, `idx_eventos_emp_inicio`, `idx_eventos_rsvp_pendente`, `ux_eventos_slug`

## eventos_campos

Campos extras do formulário de inscrição de um evento, definidos pela organização.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `evento_id` | uuid | sim |  | → eventos (**cascade**) |  |  |
| `rotulo` | text | sim |  |  |  |  |
| `tipo` | text | não | `'texto'::text` |  |  |  |
| `opcoes` | text[] | sim |  |  |  |  |
| `ajuda` | text | sim |  |  |  |  |
| `obrigatorio` | boolean | não | `false` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `ck_eventos_campos_tipo` `CHECK ((tipo = ANY (ARRAY['texto'::text, 'numero'::text, 'data'::text, 'selecao'::text, 'sim_nao'::text]))) NOT VALID`

Índices: `eventos_campos_pkey`, `idx_eventos_campos_evento`

## eventos_config

Configuração dos eventos por tenant: modo e retenção da foto do inscrito e integração com o controle de acesso (catraca).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `modo_foto` | text | não | `'nenhuma'::text` |  |  |  |
| `retencao_foto_dias` | integer | não | `30` |  |  | Dias após o evento em que a foto do inscrito é expurgada. |
| `controle_acesso_nome` | text | sim |  |  |  | Nome do sistema de controle de acesso/catraca do local. |
| `controle_acesso_exclusao_manual` | boolean | não | `true` |  |  |  |
| `atualizada_por` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_eventos_config_modo_foto` `CHECK ((modo_foto = ANY (ARRAY['nenhuma'::text, 'visual'::text, 'biometrica'::text]))) NOT VALID`

Índices: `eventos_config_pkey`, `ux_eventos_config_emp`

## eventos_dias

Dias e horários de um evento de vários dias; a presença é registrada por dia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `evento_id` | uuid | sim |  | → eventos (**cascade**) |  |  |
| `data` | date | sim |  |  |  |  |
| `hora_inicio` | time without time zone | sim |  |  |  |  |
| `hora_fim` | time without time zone | sim |  |  |  |  |
| `rotulo` | text | sim |  |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `eventos_dias_pkey`, `idx_eventos_dias_evento`, `ux_eventos_dias`

## eventos_inscricao_respostas

Respostas do inscrito aos campos extras do formulário do evento.

- **LGPD:** identificação · titulares: filiados e convidados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `inscricao_id` | uuid | sim |  | → eventos_inscricoes (**cascade**) |  |  |
| `campo_id` | uuid | sim |  | → eventos_campos |  |  |
| `rotulo` | text | sim |  |  |  |  |
| `valor` | text | sim |  |  | identificação | Resposta livre; pode conter dado pessoal conforme o campo. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `eventos_inscricao_respostas_pkey`, `idx_eventos_resp_inscricao`

## eventos_inscricoes

Inscrições em eventos, de filiados ou convidados sem login: identificação, foto, consentimento LGPD, aprovação, RSVP, controle de acesso e anonimização. Gravada pela página pública do evento e pela recepção.

- **LGPD:** identificação, **sensível: sindical**, **credencial (nunca exportar)** · titulares: filiados e convidados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `evento_id` | uuid | sim |  | → eventos (**cascade**) |  |  |
| `titular_id` | uuid | sim |  | → eventos_inscricoes (**cascade**) |  |  |
| `reservada_por` | uuid | sim |  | → usuarios |  |  |
| `nome` | text | sim |  |  | identificação |  |
| `cpf` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `telefone` | text | sim |  |  | identificação |  |
| `filiacao_id` | uuid | sim |  | → filiacoes | **sensível: sindical** | Liga a inscrição a uma filiação; revela que o inscrito é filiado. |
| `email_confirmado_em` | timestamp with time zone | sim |  |  |  |  |
| `foto_url` | text | sim |  |  | identificação | Foto do rosto para conferência na entrada; expurgada após a retenção. |
| `foto_capturada_em` | timestamp with time zone | sim |  |  |  |  |
| `foto_expurgada_em` | timestamp with time zone | sim |  |  |  |  |
| `termo_id` | uuid | sim |  | → eventos_termos |  |  |
| `termo_foto_id` | uuid | sim |  | → eventos_termos |  |  |
| `consentimento_em` | timestamp with time zone | sim |  |  |  |  |
| `consentimento_ip` | text | sim |  |  | identificação |  |
| `origem` | text | não | `'publica'::text` |  |  |  |
| `situacao` | text | não | `'pendente'::text` |  |  |  |
| `avaliada_por` | uuid | sim |  | → usuarios |  |  |
| `avaliada_em` | timestamp with time zone | sim |  |  |  |  |
| `motivo` | text | sim |  |  |  | Motivo da recusa da inscrição. |
| `rsvp_token` | text | sim |  |  | **credencial (nunca exportar)** |  |
| `rsvp_enviado_em` | timestamp with time zone | sim |  |  |  |  |
| `rsvp_respondido_em` | timestamp with time zone | sim |  |  |  |  |
| `rsvp_confirmado` | boolean | sim |  |  |  |  |
| `acesso_situacao` | text | não | `'nao_aplica'::text` |  |  | Situação do cadastro do inscrito no controle de acesso/catraca. |
| `acesso_enviado_em` | timestamp with time zone | sim |  |  |  |  |
| `acesso_removido_em` | timestamp with time zone | sim |  |  |  |  |
| `acesso_observacao` | text | sim |  |  | identificação |  |
| `anonimizada_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |
| `token` | uuid | sim | `gen_random_uuid()` |  | **credencial (nunca exportar)** | Token do link pessoal da inscrição. |
| `codigo_hash` | text | sim |  |  | **credencial (nunca exportar)** |  |
| `codigo_expira_em` | timestamp with time zone | sim |  |  |  |  |
| `codigo_tentativas` | integer | não | `0` |  |  |  |
| `convidado_por` | text | sim |  |  | identificação | Quem convidou (filiado titular da cota). |
| `prontuario_inscricao_em` | timestamp with time zone | sim |  |  |  | Quando a inscrição foi lançada no prontuário do filiado. |
| `prontuario_rsvp_em` | timestamp with time zone | sim |  |  |  |  |
| `prontuario_presenca_em` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_eventos_insc_acesso` `CHECK ((acesso_situacao = ANY (ARRAY['nao_aplica'::text, 'pendente'::text, 'enviado'::text, 'erro'::text, 'removido'::text]))) NOT VALID`; `ck_eventos_insc_origem` `CHECK ((origem = ANY (ARRAY['publica'::text, 'portal'::text, 'painel'::text, 'planilha'::text]))) NOT VALID`; `ck_eventos_insc_situacao` `CHECK ((situacao = ANY (ARRAY['pendente'::text, 'confirmada'::text, 'recusada'::text, 'cancelada'::text, 'lista_espera'::text]))) NOT VALID`

Índices: `eventos_inscricoes_pkey`, `idx_eventos_insc_convidado_por`, `idx_eventos_insc_cpf`, `idx_eventos_insc_evento`, `idx_eventos_insc_filiacao`, `idx_eventos_insc_reservada_por`, `idx_eventos_insc_rsvp_token`, `idx_eventos_insc_titular`, `ux_eventos_insc_cpf_evento`, `ux_eventos_insc_token`

## eventos_presencas

Presença confirmada de um inscrito em um dia do evento, pela recepção, por QR code ou busca.

- **LGPD:** identificação · titulares: filiados e convidados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `inscricao_id` | uuid | sim |  | → eventos_inscricoes (**cascade**) |  |  |
| `dia_id` | uuid | sim |  | → eventos_dias (**cascade**) |  |  |
| `confirmada_em` | timestamp with time zone | não | `now()` |  |  |  |
| `confirmada_por` | uuid | sim |  | → usuarios |  |  |
| `metodo` | text | não | `'busca'::text` |  |  | Como a presença foi confirmada: qr ou busca. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `ck_eventos_presencas_metodo` `CHECK ((metodo = ANY (ARRAY['qr'::text, 'busca'::text]))) NOT VALID`

Índices: `eventos_presencas_pkey`, `idx_eventos_presencas_dia`, `ux_eventos_presencas`

## eventos_termos

Versões dos termos de consentimento exibidos na inscrição (participação e uso de foto); a inscrição guarda qual versão foi aceita.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `tipo` | text | sim |  |  |  |  |
| `versao` | integer | não | `1` |  |  |  |
| `texto` | text | sim |  |  |  |  |
| `em_vigor` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Checks: `ck_eventos_termos_tipo` `CHECK ((tipo = ANY (ARRAY['inscricao'::text, 'foto_visual'::text, 'foto_biometrica'::text]))) NOT VALID`

Índices: `eventos_termos_pkey`, `idx_eventos_termos_emp`

## eventos_titular_sessao

Sessões curtas do canal LGPD do convidado de evento: ele se identifica pelo e-mail, confirma por código e pode consultar ou anonimizar seus dados.

- **LGPD:** identificação, **credencial (nunca exportar)** · titulares: convidados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `email` | text | sim |  |  | identificação |  |
| `codigo_hash` | text | sim |  |  | **credencial (nunca exportar)** |  |
| `codigo_expira_em` | timestamp with time zone | sim |  |  |  |  |
| `codigo_tentativas` | integer | não | `0` |  |  |  |
| `token` | uuid | sim | `gen_random_uuid()` |  | **credencial (nunca exportar)** |  |
| `token_expira_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `eventos_titular_sessao_pkey`, `idx_eventos_titular_email`, `ux_eventos_titular_token`

## noticias

Notícias publicadas para o painel/portal: manchete, texto e imagem. Origem Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `manchete` | text | sim |  |  |  |  |
| `noticia` | text | sim |  |  |  |  |
| `imagem` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_noticias_emp`, `noticias_bubble_id_key`, `noticias_pkey`

## notificacoes

Notificações do sino do painel por usuário, com texto, link e se já foi vista; pode apontar para marcação de ponto ou contracheque. Origem Bubble; gravada por lib/db/avisos.ts.

- **LGPD:** trabalhista, financeiro · titulares: usuários do sistema e funcionários
- **RLS:** ligado · policies: `own_notifications`, `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `usuario_id` | uuid | não |  | → usuarios |  |  |
| `notificacao` | text | não |  |  | trabalhista | Texto do aviso; pode citar ponto, contracheque ou pendências da pessoa. |
| `notificado` | boolean | sim | `false` |  |  |  |
| `notificacao_data` | date | não |  |  |  |  |
| `registro_ponto_id` | uuid | sim |  |  | trabalhista | Legado Bubble em texto; ver registro_ponto_id_fk. |
| `contracheque_id` | uuid | sim |  |  | financeiro | Legado Bubble em texto; ver contracheque_id_fk. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `registro_ponto_id_fk` | uuid | sim |  | → pessoal_registro_ponto |  |  |
| `contracheque_id_fk` | uuid | sim |  | → pessoal_contracheques | financeiro |  |
| `link` | text | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_notificacoes_notificado`, `idx_notificacoes_usuario`, `notificacoes_bubble_id_key`, `notificacoes_pkey`

## push_assinaturas

Assinaturas Web Push dos navegadores/celulares dos usuários para receber avisos do sistema.

- **LGPD:** identificação, **credencial (nunca exportar)** · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `usuario_id` | uuid | não |  | → usuarios (**cascade**) |  |  |
| `endpoint` | text | não |  |  | **credencial (nunca exportar)** | URL do serviço de push do navegador; permite enviar ao aparelho. |
| `p256dh` | text | não |  |  | **credencial (nunca exportar)** |  |
| `auth` | text | não |  |  | **credencial (nunca exportar)** | Segredo de autenticação da assinatura Web Push. |
| `user_agent` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `usado_em` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (endpoint)`

Índices: `push_assinaturas_endpoint_key`, `push_assinaturas_pkey`, `push_assinaturas_usuario_idx`
