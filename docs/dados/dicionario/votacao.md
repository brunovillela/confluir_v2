<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Votações e assembleias

33 tabelas. Diagrama: [er/votacao.md](../er/votacao.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [votacao_email_verificado](#votacao_email_verificado) | identificação, **credencial (nunca exportar)** | E-mail de votação verificado por pessoa (CPF) no tenant, usado para casar o filiado com aptos que só têm e-mail corporativo. Guarda também o… |
| [votacao_expurgo_contatos](#votacao_expurgo_contatos) | — | Registro de cada execução do expurgo dos contatos dos aptos de uma rodada (votacao_expurgar_contatos, RIPD V4): quando, com que prazo e quan… |
| [votacao_telegram_confirmacoes](#votacao_telegram_confirmacoes) | identificação, **credencial (nunca exportar)** | Confirmação de identidade pelo bot do Telegram no link único de votação (/votar). Token de uso único, 15 min. |
| [voto_apuracao_contagem](#voto_apuracao_contagem) | — | Contagem agregada por urna física, pergunta e opção (ou branco/nulo) lançada pelo apurador. Não liga voto a pessoa. |
| [voto_apuracao_eventos](#voto_apuracao_eventos) | identificação | Livro da apuração (dossiê de auditoria C-2, R-5, R-6): cada encerramento e reabertura (com o resultado congelado e o SHA-256 dele; no encerr… |
| [voto_apuracao_urna](#voto_apuracao_urna) | — | Apuração de uma urna física pelo apurador: conferência dos lacres, status e horários. A contagem fica em voto_apuracao_contagem. |
| [voto_apuradores](#voto_apuradores) | identificação | Apuradores cadastrados por rodada de votação; entram no ambiente de apuração por OTP no e-mail. |
| [voto_assembleia_resultados](#voto_assembleia_resultados) | — | Resultados de assembleia só com bubble_id. Sem uso encontrado no código (possível legado do Bubble), substituída por voto_resultado_final. |
| [voto_assembleias](#voto_assembleias) | identificação | Assembleia de votação dentro de uma rodada: online, urna ou reunião de trabalhadores, com janela, edital, sala virtual e resultado agregado.… |
| [voto_assembleias_aptos](#voto_assembleias_aptos) | identificação, **sensível: sindical**, trabalhista, **credencial (nunca exportar)** | Lista de eleitores aptos por rodada/assembleia, espelho de Assembleias - Aptos do Bubble. Registra a PARTICIPAÇÃO (quem votou, quando, canal… |
| [voto_assembleias_empresas](#voto_assembleias_empresas) | — | Junção assembleia x empresa. Sem uso encontrado no código (possível legado do Bubble), vazia; o vínculo atual é voto_assembleias.empresa_id. |
| [voto_assembleias_perguntas](#voto_assembleias_perguntas) | — | Pergunta submetida a votação numa rodada/assembleia, com contadores agregados de aprovo, reprovo, abstenção e branco. Veio do Bubble. |
| [voto_aviso_acoes](#voto_aviso_acoes) | identificação | Rastro das ações sobre os avisos de uma rodada de votação (reenvio, envio manual em lotes, aviso prévio, envio automático): quem, quando, qu… |
| [voto_campanha](#voto_campanha) | — | Campanha de votação (tema) que agrupa rodadas e assembleias, espelho de VOTO Campanha do Bubble; fontes pagadoras em voto_campanha_fontes. |
| [voto_campanha_fontes](#voto_campanha_fontes) | — | Junção campanha de votação x fonte pagadora (empresa) abrangida. |
| [voto_em_separado](#voto_em_separado) | identificação, **sensível: sindical** | Eleitor que alega direito a votar sem estar na lista de aptos, cadastrado pelo mesário. LIGA VOTO A PESSOA de propósito: voto_online.em_sepa… |
| [voto_entrega_dominios](#voto_entrega_dominios) | — | Histórico da entrega do e-mail corporativo por domínio de empresa (teste de entrega da fase 3, 22/10/2026): uma medição por rodada — pelo av… |
| [voto_mesario](#voto_mesario) | — | Junção mesário x urna do Bubble. Sem uso encontrado no código além da lista de tabelas do tenant (possível legado do Bubble), vazia. |
| [voto_mesarios](#voto_mesarios) | identificação | Mesários cadastrados por rodada de votação; entram no ambiente /mesario por OTP no e-mail e registram presença dos eleitores, nunca o voto. |
| [voto_online](#voto_online) | **sensível: sindical** | Voto individual por pergunta (online, portal, urna digital ou com mesário). O voto NÃO é ligado à pessoa: eleitor_id é sempre nulo (CHECK vo… |
| [voto_opcoes_resposta](#voto_opcoes_resposta) | — | Opções de resposta de cada pergunta de votação (aprovo, reprovo, abstenção ou texto livre). Veio do Bubble. |
| [voto_participacao_legado](#voto_participacao_legado) | identificação, **sensível: sindical** | Quem participou das votações migradas do Bubble (uma linha por rodada, assembleia e eleitor), separado do conteúdo do voto, que fica anônimo… |
| [voto_resultado_final](#voto_resultado_final) | — | Resultado final agregado por assembleia, pergunta e opção (ou branco/nulo), confirmado pelo gestor ao encerrar a apuração; é o que o filiado… |
| [voto_resultado_presencial](#voto_resultado_presencial) | — | Espelho de "VOTO Resultado presencial" do Bubble. Contagem agregada de votos presenciais por opção de resposta (não nominal). |
| [voto_rod_assembleias](#voto_rod_assembleias) | identificação | Rodada de votação (período) dentro de uma campanha, dona das perguntas, da lista de aptos e das assembleias. Veio do Bubble; tela Representa… |
| [voto_unidades_presenciais](#voto_unidades_presenciais) | — | Unidades ou bases de votação presencial por empresa e rodada, vindas do Bubble. Sem uso encontrado no código além da lista de tabelas do ten… |
| [voto_urna](#voto_urna) | — | Urna do Bubble (local, número, lacres). Sem uso encontrado no código (possível legado do Bubble), vazia; substituída por voto_urnas. |
| [voto_urna_disponibilidade](#voto_urna_disponibilidade) | — | Espelho de "VOTO Urna disponibilidade" do Bubble. Schema-only (0 registros no Bubble). |
| [voto_urna_eventos](#voto_urna_eventos) | identificação, **sensível: sindical** | Eventos da ata de uma urna: instalação, abertura, fechamento, encerramento e anomalias, com quem operou e o primeiro eleitor que atesta o la… |
| [voto_urna_lacres](#voto_urna_lacres) | — | Controle dos lacres (boca e principal) de uma urna física: número de série, instalação, rompimento e guarda dentro da urna. |
| [voto_urna_terminais](#voto_urna_terminais) | **credencial (nunca exportar)**, **sensível: sindical** | Terminal de votação pareado a uma urna digital. O mesário libera a cédula para um apto ou eleitor em separado; o voto é gravado sem ligar ao… |
| [voto_urnas](#voto_urnas) | — | Urna física ou digital de uma assembleia presencial, com janela de abertura/fechamento e apurador atribuído. |
| [voto_votacao_respostas](#voto_votacao_respostas) | **sensível: sindical**, identificação | Espelho de "Assembleias - Votações - Respostas" do Bubble (slug assembleias___perguntas___respostas). Tabela LEGADA -- versão anterior de vo… |

## votacao_email_verificado

E-mail de votação verificado por pessoa (CPF) no tenant, usado para casar o filiado com aptos que só têm e-mail corporativo. Guarda também o código de verificação pendente.

- **LGPD:** identificação, **credencial (nunca exportar)** · titulares: eleitores
- **RLS:** ligado · policies: `votacao_email_verificado_tenant`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `cpf` | text | não |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `verificado_em` | timestamp with time zone | sim |  |  |  |  |
| `pend_email` | text | sim |  |  | identificação | E-mail aguardando confirmação. |
| `pend_codigo_hash` | text | sim |  |  | **credencial (nunca exportar)** | Hash do código de verificação enviado por e-mail. |
| `pend_codigo_token` | text | sim |  |  | **credencial (nunca exportar)** | Token do link de confirmação do e-mail. |
| `pend_expira_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `pend_tentativas` | integer | não | `0` |  |  | Erros já cometidos com o código pendente (pend_codigo_hash). Zera a cada código novo; com 5, o código deixa de valer e é preciso pedir outro (R-2). |

Únicas: `UNIQUE (emp_proprietaria_id, cpf)`

Índices: `votacao_email_verificado_emp_proprietaria_id_cpf_key`, `votacao_email_verificado_pkey`

## votacao_expurgo_contatos

Registro de cada execução do expurgo dos contatos dos aptos de uma rodada (votacao_expurgar_contatos, RIPD V4): quando, com que prazo e quantas linhas. Só contagens, sem dado pessoal.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `votacao_expurgo_contatos_tenant`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `rod_assembleia_id` | uuid | não |  | → voto_rod_assembleias (**cascade**) |  |  |
| `executado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `reter_dias` | smallint | não |  |  |  |  |
| `apuracao_encerrada_em` | timestamp with time zone | sim |  |  |  |  |
| `aptos_limpos` | integer | não | `0` |  |  |  |
| `emails_verificados_apagados` | integer | não | `0` |  |  |  |
| `telegram_confirmacoes_apagadas` | integer | não | `0` |  |  |  |

Índices: `votacao_expurgo_contatos_pkey`, `votacao_expurgo_contatos_rodada_idx`

## votacao_telegram_confirmacoes

Confirmação de identidade pelo bot do Telegram no link único de votação (/votar). Token de uso único, 15 min.

- **LGPD:** identificação, **credencial (nunca exportar)** · titulares: eleitores
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `token` | text | não |  |  | **credencial (nunca exportar)** |  |
| `criado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `expira_em` | timestamp with time zone | não |  |  |  |  |
| `chat_id` | text | sim |  |  | identificação | Identificador do chat da pessoa no Telegram. |
| `telefone` | text | sim |  |  | identificação |  |
| `nome_telegram` | text | sim |  |  | identificação |  |
| `confirmado_em` | timestamp with time zone | sim |  |  |  |  |
| `usado_em` | timestamp with time zone | sim |  |  |  |  |
| `falhas_cadastro` | integer | não | `0` |  |  | Tentativas de identificação que não conferiram; trava em 5 por chat. |

Únicas: `UNIQUE (token)`

Índices: `votacao_telegram_confirmacoes_chat_idx`, `votacao_telegram_confirmacoes_pkey`, `votacao_telegram_confirmacoes_token_key`

## voto_apuracao_contagem

Contagem agregada por urna física, pergunta e opção (ou branco/nulo) lançada pelo apurador. Não liga voto a pessoa.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `voto_apuracao_contagem_tenant`
- **Triggers:** `voto_apuracao_contagem_travas` → `voto_apuracao_contagem_travas`, `voto_apuracao_contagem_travas_truncate` → `voto_apuracao_contagem_travas`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `apuracao_urna_id` | uuid | não |  | → voto_apuracao_urna (**cascade**) |  |  |
| `pergunta_id` | uuid | não |  | → voto_assembleias_perguntas |  |  |
| `opcao_id` | uuid | sim |  | → voto_opcoes_resposta |  |  |
| `tipo` | text | não | `'opcao'::text` |  |  | opcao, branco ou nulo. |
| `quantidade` | integer | não | `0` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (apuracao_urna_id, pergunta_id, opcao_id, tipo)`

Checks: `voto_apuracao_contagem_tipo_check` `CHECK ((tipo = ANY (ARRAY['opcao'::text, 'branco'::text, 'nulo'::text])))`

Índices: `voto_apuracao_contagem_apuracao_urna_id_pergunta_id_opcao_i_key`, `voto_apuracao_contagem_pkey`

## voto_apuracao_eventos

Livro da apuração (dossiê de auditoria C-2, R-5, R-6): cada encerramento e reabertura (com o resultado congelado e o SHA-256 dele; no encerramento, também a conferência C-5), cada prorrogação da assembleia (de/para do término e da rodada) e cada ressalva de lacre da urna física, com quem, quando e motivo. Só acrescenta: o banco recusa alterar ou apagar. Escrito só pelos triggers de voto_assembleias e voto_apuracao_urna. Não guarda voto de ninguém.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `voto_apuracao_eventos_imutavel` → `voto_apuracao_eventos_imutavel`, `voto_apuracao_eventos_imutavel_truncate` → `voto_apuracao_eventos_imutavel`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `assembleia_id` | uuid | não |  | → voto_assembleias |  |  |
| `tipo` | text | não |  |  |  | encerramento, reabertura, prorrogacao ou lacre. |
| `motivo` | text | sim |  |  |  | Por que a apuração foi reaberta, por que a assembleia foi prorrogada, ou a justificativa do apurador para o lacre não atestado (obrigatório, ao menos 5 caracteres). Nulo no encerramento. |
| `usuario_id` | uuid | sim |  |  | identificação | Usuário do painel que encerrou, reabriu ou prorrogou (nulo em encerramento feito fora do painel e no evento de lacre, que é do apurador: ver detalhe). |
| `resultado` | jsonb | não | `'[]'::jsonb` |  |  | Resultado congelado (voto_resultado_final) no momento do evento: [{pergunta_id, opcao_id, tipo, quantidade}]. Na reabertura, é o resultado que deixou de valer. |
| `resultado_hash` | text | sim |  |  |  | SHA-256 do texto canônico desse resultado (voto_resultado_texto). Nulo nos eventos de prorrogação e de lacre, que não mexem no resultado. |
| `conferencia` | jsonb | sim |  |  |  | Conferência automática no encerramento (votacao_conferencia, C1–C6): {ok, verificacoes: [{id, nome, ok, detalhe}]}. Preenchida uma única vez, no mesmo encerramento. |
| `created_at` | timestamp with time zone | não | `clock_timestamp()` |  |  | Quando a apuração foi encerrada ou reaberta. |
| `detalhe` | jsonb | sim |  |  |  | Dados do evento que não são resultado. Prorrogação: {numero, termino_de, termino_para, rodada_de, rodada_para} (rodada_* só quando a rodada foi estendida). Lacre: {urna_id, urna, apurador_id, lacres_ok}. |

Checks: `voto_apuracao_eventos_hash_check` `CHECK (((tipo = ANY (ARRAY['prorrogacao'::text, 'lacre'::text])) OR (resultado_hash IS NOT NULL)))`; `voto_apuracao_eventos_motivo_check` `CHECK (((tipo = 'encerramento'::text) OR (length(btrim(COALESCE(motivo, ''::text))) >= 5)))`; `voto_apuracao_eventos_tipo_check` `CHECK ((tipo = ANY (ARRAY['encerramento'::text, 'reabertura'::text, 'prorrogacao'::text, 'lacre'::text])))`

Índices: `voto_apuracao_eventos_assembleia_idx`, `voto_apuracao_eventos_pkey`

## voto_apuracao_urna

Apuração de uma urna física pelo apurador: conferência dos lacres, status e horários. A contagem fica em voto_apuracao_contagem.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `voto_apuracao_urna_tenant`
- **Triggers:** `voto_apuracao_urna_livro` → `voto_apuracao_urna_livro`, `voto_apuracao_urna_travas` → `voto_apuracao_urna_travas`, `voto_apuracao_urna_travas_truncate` → `voto_apuracao_urna_travas`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `urna_id` | uuid | não |  | → voto_urnas |  |  |
| `apurador_id` | uuid | sim |  | → voto_apuradores |  |  |
| `lacres_ok` | boolean | sim |  |  |  |  |
| `lacres_observacao` | text | sim |  |  |  |  |
| `status` | text | não | `'em_andamento'::text` |  |  |  |
| `iniciada_em` | timestamp with time zone | não | `now()` |  |  |  |
| `concluida_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, urna_id)`

Checks: `voto_apuracao_urna_status_check` `CHECK ((status = ANY (ARRAY['em_andamento'::text, 'concluida'::text])))`

Índices: `voto_apuracao_urna_emp_proprietaria_id_urna_id_key`, `voto_apuracao_urna_pkey`

## voto_apuradores

Apuradores cadastrados por rodada de votação; entram no ambiente de apuração por OTP no e-mail.

- **LGPD:** identificação · titulares: apuradores (filiados ou diretores)
- **RLS:** ligado · policies: `voto_apuradores_tenant`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `rod_assembleia_id` | uuid | não |  | → voto_rod_assembleias |  |  |
| `nome_completo` | text | não |  |  | identificação |  |
| `cpf` | text | sim |  |  | identificação |  |
| `email` | text | não |  |  | identificação |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_voto_apuradores_email`, `idx_voto_apuradores_rodada`, `voto_apuradores_pkey`

## voto_assembleia_resultados

Resultados de assembleia só com bubble_id. Sem uso encontrado no código (possível legado do Bubble), substituída por voto_resultado_final.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `assembleia_id` | uuid | sim |  | → voto_assembleias |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `assembleia_resultados_bubble_id_key`, `assembleia_resultados_pkey`

## voto_assembleias

Assembleia de votação dentro de uma rodada: online, urna ou reunião de trabalhadores, com janela, edital, sala virtual e resultado agregado. Veio do Bubble e é mantida em Representação > Votações.

- **LGPD:** identificação
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`, `voto_assembleias_apuracao_carimbo` → `voto_assembleias_apuracao_carimbo`, `voto_assembleias_apuracao_desvinculo` → `voto_assembleias_apuracao_desvinculo`, `voto_assembleias_apuracao_janela` → `voto_assembleias_apuracao_janela`, `voto_assembleias_apuracao_livro` → `voto_assembleias_apuracao_livro`, `voto_assembleias_conferencia_encerramento` → `voto_assembleias_conferencia_encerramento`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `nome_assembleia` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `inicio` | timestamp with time zone | sim |  |  |  |  |
| `termino` | timestamp with time zone | sim |  |  |  |  |
| `edital` | text | sim |  |  |  |  |
| `card_grafico` | text | sim |  |  |  | Imagem de divulgação da assembleia. |
| `video_indicativo_url` | text | sim |  |  |  |  |
| `contador_votos` | integer | sim | `0` |  |  | Total de participações contadas (agregado). |
| `apuracao_encerrada` | boolean | sim | `false` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `campanha_id` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `ata` | text | sim |  |  | identificação | Ata da assembleia; pode citar nomes. |
| `data_inicio` | date | sim |  |  |  |  |
| `data_realizacao` | date | sim |  |  |  |  |
| `data_termino` | date | sim |  |  |  |  |
| `online` | boolean | sim | `false` |  |  |  |
| `periodo_inicio` | date | sim |  |  |  |  |
| `periodo_termino` | date | sim |  |  |  |  |
| `resultado_abstencao` | integer | sim |  |  |  |  |
| `resultado_aprovado` | integer | sim |  |  |  |  |
| `resultado_em_branco` | integer | sim |  |  |  |  |
| `resultado_reprovado` | integer | sim |  |  |  |  |
| `total_votos` | integer | sim |  |  |  |  |
| `urnas_de_votacao` | boolean | sim | `false` |  |  |  |
| `voto_em_separado` | boolean | sim | `false` |  |  | Permite voto em separado de quem não está na lista de aptos. |
| `slug` | text | sim |  |  |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `somente_filiados` | boolean | não | `false` |  |  | Restringe a votação a filiados ativos. |
| `hora_inicio` | time without time zone | sim |  |  |  |  |
| `hora_termino` | time without time zone | sim |  |  |  |  |
| `sala_link` | text | sim |  |  |  | Link da sala da assembleia virtual (https). Vai no e-mail de aviso aos aptos. |
| `sala_data` | date | sim |  |  |  | Data da reunião na sala virtual. |
| `sala_hora` | time without time zone | sim |  |  |  | Hora da reunião na sala virtual (horário de Brasília). |
| `apuracao_encerrada_em` | timestamp with time zone | sim |  |  |  | Quando a apuração foi encerrada (carimbado pelo trigger voto_assembleias_apuracao_carimbo; nulo se reaberta). Conta o prazo do expurgo dos contatos dos aptos. |
| `resultado_hash` | text | sim |  |  |  | SHA-256 (hex) do texto canônico do resultado congelado (voto_resultado_texto), calculado pelo banco no encerramento da apuração e apagado na reabertura. Publicado na apuração, no relatório e no portal para conferência (dossiê C-3). |
| `apuracao_motivo` | text | sim |  |  |  | Parâmetro do movimento da apuração: o motivo da reabertura, enviado junto com apuracao_encerrada = false. O trigger voto_assembleias_apuracao_livro o copia para voto_apuracao_eventos e o devolve a nulo. |
| `apuracao_por` | uuid | sim |  |  | identificação | Parâmetro do movimento da apuração: o usuário que encerra ou reabre. O trigger voto_assembleias_apuracao_livro o copia para voto_apuracao_eventos e o devolve a nulo. |

Únicas: `UNIQUE (bubble_id)`

Índices: `assembleias_bubble_id_key`, `assembleias_pkey`, `idx_assembleias_inicio`, `idx_bub_assembleias`, `idx_voto_assembleias_rodada`, `idx_voto_assembleias_somente_filiados`

## voto_assembleias_aptos

Lista de eleitores aptos por rodada/assembleia, espelho de Assembleias - Aptos do Bubble. Registra a PARTICIPAÇÃO (quem votou, quando, canal, presença na urna, comprovante), mas NÃO o conteúdo do voto, que fica anônimo em voto_online.

- **LGPD:** identificação, **sensível: sindical**, trabalhista, **credencial (nunca exportar)** · titulares: eleitores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `cpf` | text | sim |  |  | identificação |  |
| `codigo_assembleia` | text | sim |  |  |  |  |
| `email_corporativo` | text | sim |  |  | identificação |  |
| `hora_voto` | timestamp with time zone | sim |  |  | **sensível: sindical** | Participação na votação (quem votou e quando). Não contém o conteúdo do voto. |
| `matricula` | text | sim |  |  | trabalhista |  |
| `nome_completo` | text | sim |  |  | identificação |  |
| `assembleia_id` | uuid | sim |  | → voto_assembleias |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `eleitor_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `nome_completo_norm` | text | sim | `f_unaccent(lower(nome_completo))` |  | identificação |  |
| `presenca_em` | timestamp with time zone | sim |  |  | **sensível: sindical** | Presença registrada pelo mesário na urna. |
| `presenca_mesario_id` | uuid | sim |  | → voto_mesarios | **sensível: sindical** |  |
| `presenca_urna_id` | uuid | sim |  | → voto_urnas | **sensível: sindical** |  |
| `nome_informado` | text | sim |  |  | identificação |  |
| `nascimento_informado` | date | sim |  |  | identificação | Data de nascimento DECLARADA pelo eleitor no primeiro acesso. |
| `dados_informados_em` | timestamp with time zone | sim |  |  |  |  |
| `cpf_conflito` | text | sim |  |  | identificação | CPF informado que colidiu com outro apto da mesma votação — a gestão resolve. |
| `conflito_motivo` | text | sim |  |  | identificação |  |
| `conflito_em` | timestamp with time zone | sim |  |  |  |  |
| `aviso_email_em` | timestamp with time zone | sim |  |  |  |  |
| `aviso_email_para` | text | sim |  |  | identificação |  |
| `aviso_email_erro` | text | sim |  |  |  | Erro do envio do e-mail de aviso. |
| `comprovante_codigo` | text | sim |  |  | **sensível: sindical** | Código do comprovante de participação; nunca do conteúdo do voto. |
| `comprovante_hash` | text | sim |  |  | **sensível: sindical** |  |
| `comprovante_canal` | text | sim |  |  | **sensível: sindical** | online, urna_digital ou urna_fisica. |
| `comprovante_em` | timestamp with time zone | sim |  |  |  |  |
| `comprovante_email_em` | timestamp with time zone | sim |  |  |  |  |
| `telefone` | text | sim |  |  | identificação |  |
| `telegram_chat_id` | text | sim |  |  | identificação |  |
| `telegram_vinculado_em` | timestamp with time zone | sim |  |  |  |  |
| `email_contato` | text | sim |  |  | identificação | E-mail confirmado pelo eleitor no link único de votação (minúsculas). Recebe o comprovante. |
| `cadastro_canal` | text | sim |  |  | **sensível: sindical** | Por onde o eleitor se identificou: link_unico (página /votar). |
| `cadastro_em` | timestamp with time zone | sim |  |  |  |  |
| `aviso_primeiro_em` | timestamp with time zone | sim |  |  |  |  |
| `aviso_tentativas` | smallint | não | `0` |  |  | Tentativas do aviso automático por e-mail. |
| `acesso_canal` | text | sim |  |  | **sensível: sindical** | Por onde a pessoa entrou para votar: link pessoal, link único por e-mail ou Telegram, código, portal. |
| `aviso_contato_em` | timestamp with time zone | sim |  |  | identificação | Quando o link pessoal saiu para o contato confirmado no link geral (e-mail pessoal e/ou Telegram); null = pendente. |
| `aviso_contato_canais` | text | sim |  |  | identificação | Canais do aviso ao contato que deram certo: "email", "telegram" ou "email,telegram". |
| `aviso_contato_erro` | text | sim |  |  | identificação | Falha do aviso ao contato: "falha" quando nenhum canal aceitou o envio. |
| `aviso_previo_em` | timestamp with time zone | sim |  |  | identificação | Quando saiu o aviso prévio (teste de entrega) ao e-mail corporativo, dias antes da votação; null = pendente. |
| `aviso_previo_erro` | text | sim |  |  | identificação | Aviso prévio não enviado: "sem_email", "duplicado", "preferencia" ou "falha". |
| `recebido_em` | timestamp with time zone | sim |  |  | identificação | Quando a pessoa confirmou, pelo botão "Recebi" do aviso prévio, que o e-mail corporativo chegou (formulário: o robô de segurança da empresa não confirma). |
| `email_entregue_em` | timestamp with time zone | sim |  |  | identificação | Brevo: quando o aviso com o link pessoal foi entregue ao servidor do destinatário (último envio). |
| `email_clique_humano_em` | timestamp with time zone | sim |  |  | identificação | Brevo: primeiro clique no aviso com o link pessoal mais de 2 min depois da entrega — gente, não o robô de segurança. |
| `email_clique_robo_em` | timestamp with time zone | sim |  |  | identificação | Brevo: clique no aviso até 2 min depois da entrega — típico do robô de segurança da empresa, que abre todos os links. |
| `email_rejeicao` | text | sim |  |  | identificação | Brevo: rejeição definitiva do aviso (hard_bounce, invalid_email, blocked, spam) com o motivo curto; o apto passa a contar como sem link. |

Únicas: `UNIQUE (bubble_id)`

Índices: `assembleias_aptos_bubble_id_key`, `assembleias_aptos_pkey`, `idx_voto_aptos_rodada_cpf`, `voto_aptos_comprovante_codigo_idx`, `voto_aptos_nome_norm_trgm`, `voto_aptos_rodada_cpf_votou_idx`, `voto_aptos_telegram_chat_idx`, `voto_assembleias_aptos_assembleia_cpf_idx`, `voto_assembleias_aptos_aviso_contato_idx`, `voto_assembleias_aptos_aviso_pendente_idx`, `voto_assembleias_aptos_email_contato_idx`

## voto_assembleias_empresas

Junção assembleia x empresa. Sem uso encontrado no código (possível legado do Bubble), vazia; o vínculo atual é voto_assembleias.empresa_id.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `assembleia_id` | uuid | não |  | → voto_assembleias (**cascade**) |  |  |
| 🔑 `empresa_id` | uuid | não |  | → empresa (**cascade**) |  |  |

Índices: `assembleias_empresas_pkey`

## voto_assembleias_perguntas

Pergunta submetida a votação numa rodada/assembleia, com contadores agregados de aprovo, reprovo, abstenção e branco. Veio do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `pergunta` | text | sim |  |  |  |  |
| `assembleia_id` | uuid | sim |  | → voto_assembleias |  | FK para assembleias (VOTO Assembleias) -- campo ASSEMBLEIA do Bubble |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `ordem` | integer | sim |  |  |  |  |
| `conta_aprovo` | integer | sim |  |  |  |  |
| `conta_reprovo` | integer | sim |  |  |  |  |
| `conta_abstencao` | integer | sim |  |  |  |  |
| `conta_em_branco` | integer | sim |  |  |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `assembleias_perguntas_bubble_id_key`, `assembleias_perguntas_pkey`, `idx_voto_perguntas_rodada`

## voto_aviso_acoes

Rastro das ações sobre os avisos de uma rodada de votação (reenvio, envio manual em lotes, aviso prévio, envio automático): quem, quando, qual ação e quantos aptos atingiu. Mostrado no card do aviso da rodada (22/10/2026).

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `rodada_id` | uuid | não |  | → voto_rod_assembleias (**cascade**) |  |  |
| `acao` | text | não |  |  |  | reabrir_nao_votaram, reabrir_todos, reabrir_falhas, reabrir_contato, enviar_aviso, enviar_aviso_previo, aviso_auto, aviso_previo_auto. |
| `quantidade` | integer | sim |  |  |  | Aptos atingidos (voltaram para a fila, ou avisos enviados no lote). |
| `detalhe` | text | sim |  |  |  |  |
| `usuario_id` | uuid | sim |  |  | identificação | Quem fez. |
| `usuario_nome` | text | sim |  |  | identificação | Nome de quem fez, no momento da ação. |
| `criado_em` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `voto_aviso_acoes_pkey`, `voto_aviso_acoes_rodada_idx`

## voto_campanha

Campanha de votação (tema) que agrupa rodadas e assembleias, espelho de VOTO Campanha do Bubble; fontes pagadoras em voto_campanha_fontes.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `tema` | text | sim |  |  |  |  |
| `finalizado` | boolean | sim |  |  |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `empresas_raw` | jsonb | sim |  |  |  | Lista de bubble_ids das empresas no legado; normalizada em voto_campanha_fontes. |
| `rod_assembleias_raw` | jsonb | sim |  |  |  | Lista de bubble_ids das rodadas no legado. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `voto_campanha_bubble_id_key`, `voto_campanha_pkey`

## voto_campanha_fontes

Junção campanha de votação x fonte pagadora (empresa) abrangida.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `campanha_id` | uuid | não |  | → voto_campanha (**cascade**) |  |  |
| `empresa_id` | uuid | não |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (campanha_id, empresa_id)`

Índices: `voto_campanha_fontes_campanha_id_empresa_id_key`, `voto_campanha_fontes_pkey`

## voto_em_separado

Eleitor que alega direito a votar sem estar na lista de aptos, cadastrado pelo mesário. LIGA VOTO A PESSOA de propósito: voto_online.em_separado_id aponta para cá até a apuração deferir ou descartar o voto.

- **LGPD:** identificação, **sensível: sindical** · titulares: eleitores
- **RLS:** ligado · policies: `voto_em_separado_tenant`
- **Triggers:** `voto_em_separado_decisao_definitiva` → `voto_em_separado_decisao_definitiva`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `assembleia_id` | uuid | não |  | → voto_assembleias |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `urna_id` | uuid | sim |  | → voto_urnas |  |  |
| `mesario_id` | uuid | sim |  | → voto_mesarios |  |  |
| `nome_completo` | text | não |  |  | identificação |  |
| `cpf` | text | sim |  |  | identificação |  |
| `data_nascimento` | date | sim |  |  | identificação |  |
| `telefone` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `status` | text | não | `'pendente'::text` |  | **sensível: sindical** | pendente, deferido ou indeferido. |
| `votou_em` | timestamp with time zone | sim |  |  | **sensível: sindical** |  |
| `decidido_em` | timestamp with time zone | sim |  |  |  |  |
| `observacao` | text | sim |  |  | **sensível: sindical** |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `desvinculado_em` | timestamp with time zone | sim |  |  |  | Quando o voto deixou de apontar para este cadastro (encerramento da apuração). Daí em diante a decisão é definitiva e não há contato guardado. |

Checks: `voto_em_separado_status_check` `CHECK ((status = ANY (ARRAY['pendente'::text, 'deferido'::text, 'indeferido'::text])))`

Índices: `idx_voto_em_separado_assembleia`, `idx_voto_em_separado_urna`, `voto_em_separado_pkey`

## voto_entrega_dominios

Histórico da entrega do e-mail corporativo por domínio de empresa (teste de entrega da fase 3, 22/10/2026): uma medição por rodada — pelo aviso prévio ("Recebi") ou pela votação (votos pelo link pessoal). A próxima rodada da mesma empresa já nasce avisada. Só números agregados e o domínio.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `dominio` | text | não |  |  |  | Domínio do e-mail corporativo predominante na lista de aptos (ex.: halliburton.com). |
| `rodada_id` | uuid | sim |  | → voto_rod_assembleias (set null) |  |  |
| `rodada_nome` | text | sim |  |  |  |  |
| `medida` | text | não |  |  |  | "aviso_previo" = confirmaram o Recebi / avisados; "votacao" = votos pelo link pessoal / votantes com canal registrado. |
| `medido_em` | timestamp with time zone | não | `now()` |  |  |  |
| `base` | integer | não |  |  |  | Denominador da medição (avisados, ou votantes com canal registrado). |
| `sucesso` | integer | não |  |  |  | Numerador (confirmaram o Recebi, ou votaram pelo link pessoal). |
| `situacao` | text | não |  |  |  | "chega", "nao_chega" ou "incerto", pela taxa sucesso/base. |
| `observacao` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `voto_entrega_dominios_base_check` `CHECK ((base >= 0))`; `voto_entrega_dominios_medida_check` `CHECK ((medida = ANY (ARRAY['aviso_previo'::text, 'votacao'::text])))`; `voto_entrega_dominios_situacao_check` `CHECK ((situacao = ANY (ARRAY['chega'::text, 'nao_chega'::text, 'incerto'::text])))`; `voto_entrega_dominios_sucesso_check` `CHECK ((sucesso >= 0))`

Índices: `voto_entrega_dominios_dominio_idx`, `voto_entrega_dominios_medicao_key`, `voto_entrega_dominios_pkey`

## voto_mesario

Junção mesário x urna do Bubble. Sem uso encontrado no código além da lista de tabelas do tenant (possível legado do Bubble), vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `mesario_id` | uuid | sim |  | → usuarios |  |  |
| `urna_id` | uuid | sim |  | → voto_urna |  |  |
| `presidente` | boolean | sim | `false` |  |  | Mesário presidente da urna. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `voto_mesario_bubble_id_key`, `voto_mesario_pkey`

## voto_mesarios

Mesários cadastrados por rodada de votação; entram no ambiente /mesario por OTP no e-mail e registram presença dos eleitores, nunca o voto.

- **LGPD:** identificação · titulares: mesários (filiados ou diretores)
- **RLS:** ligado · policies: `voto_mesarios_tenant`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `rod_assembleia_id` | uuid | não |  | → voto_rod_assembleias |  |  |
| `nome_completo` | text | não |  |  | identificação |  |
| `cpf` | text | sim |  |  | identificação |  |
| `email` | text | não |  |  | identificação |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `idx_voto_mesarios_email`, `idx_voto_mesarios_rodada`, `voto_mesarios_pkey`

## voto_online

Voto individual por pergunta (online, portal, urna digital ou com mesário). O voto NÃO é ligado à pessoa: eleitor_id é sempre nulo (CHECK voto_online_sem_eleitor), mesario_id nulo e hora truncada. Exceção: voto em separado aponta em_separado_id até a apuração. A participação dos votos legados do Bubble está em voto_participacao_legado.

- **LGPD:** **sensível: sindical** · titulares: eleitores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`, `voto_online_em_separado_aberto` → `voto_online_em_separado_aberto`, `voto_online_hora_secreta` → `voto_online_hora_secreta`, `voto_online_imutavel` → `voto_online_imutavel`, `voto_online_imutavel_truncate` → `voto_online_imutavel`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `eleitor_id` | uuid | sim |  | → usuarios |  | Sempre nulo (CHECK voto_online_sem_eleitor). Mantida só por compatibilidade; a participação legada está em voto_participacao_legado. |
| `ip_codigo` | text | sim |  |  | identificação | IP do eleitor no legado do Bubble; o código atual não grava. Junto com resposta_id pode reidentificar o voto. |
| `ip_localidade` | text | sim |  |  | identificação | Localidade do IP no legado do Bubble. |
| `valido` | boolean | sim | `false` |  |  | Voto válido para a apuração; em separado indeferido é descartado. |
| `urna_id` | uuid | sim |  | → voto_urna |  |  |
| `mesario_id` | uuid | sim |  | → voto_mesarios |  | Gravado nulo no código atual, para não ligar o voto ao operador da urna. |
| `resposta_id` | uuid | sim |  | → voto_opcoes_resposta | **sensível: sindical** | Conteúdo do voto (opção escolhida). |
| `pergunta_id` | uuid | sim |  | → voto_assembleias_perguntas |  |  |
| `assembleia_id` | uuid | sim |  | → voto_assembleias |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  | Data do voto truncada para o início do mês (trigger voto_online_hora_secreta). A hora exata fica só na participação (voto_assembleias_aptos.hora_voto), nunca junto do voto. |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  | Sempre igual a created_at (início do mês), garantido pelo trigger voto_online_hora_secreta. Nunca a hora exata do voto. |
| `em_separado_id` | uuid | sim |  | → voto_em_separado | **sensível: sindical** | Liga o voto ao cadastro de voto_em_separado só até o encerramento da apuração, quando o trigger voto_assembleias_apuracao_desvinculo o anula (indeferido vira valido = false). O trigger voto_online_em_separado_aberto recusa o vínculo em assembleia encerrada. |

Únicas: `UNIQUE (bubble_id)`

Checks: `voto_online_sem_eleitor` `CHECK ((eleitor_id IS NULL))`

Índices: `idx_bub_voto_online`, `idx_voto_online_pergunta`, `voto_online_bubble_id_key`, `voto_online_pkey`

## voto_opcoes_resposta

Opções de resposta de cada pergunta de votação (aprovo, reprovo, abstenção ou texto livre). Veio do Bubble.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `opcao_resposta` | text | sim |  |  |  |  |
| `pergunta_id` | uuid | sim |  | → voto_assembleias_perguntas |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `idx_voto_opcoes_pergunta`, `voto_opcoes_resposta_bubble_id_key`, `voto_opcoes_resposta_pkey`

## voto_participacao_legado

Quem participou das votações migradas do Bubble (uma linha por rodada, assembleia e eleitor), separado do conteúdo do voto, que fica anônimo em voto_online. Criada em 18/10/2026 ao zerar voto_online.eleitor_id.

- **LGPD:** identificação, **sensível: sindical** · titulares: eleitores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `assembleia_id` | uuid | sim |  | → voto_assembleias |  |  |
| `eleitor_id` | uuid | não |  | → usuarios | **sensível: sindical** | Usuário que votou. Revela participação, nunca o voto. |
| `origem` | text | não | `'bubble'::text` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE NULLS NOT DISTINCT (emp_proprietaria_id, rod_assembleia_id, assembleia_id, eleitor_id)`

Índices: `voto_participacao_legado_assembleia_idx`, `voto_participacao_legado_eleitor_idx`, `voto_participacao_legado_pkey`, `voto_participacao_legado_unica`

## voto_resultado_final

Resultado final agregado por assembleia, pergunta e opção (ou branco/nulo), confirmado pelo gestor ao encerrar a apuração; é o que o filiado vê em Minhas votações. Não liga voto a pessoa.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `voto_resultado_final_tenant`
- **Triggers:** `voto_resultado_final_congelado` → `voto_resultado_final_congelado`, `voto_resultado_final_congelado_truncate` → `voto_resultado_final_congelado`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `assembleia_id` | uuid | não |  | → voto_assembleias |  |  |
| `pergunta_id` | uuid | não |  | → voto_assembleias_perguntas |  |  |
| `opcao_id` | uuid | sim |  | → voto_opcoes_resposta |  |  |
| `tipo` | text | não | `'opcao'::text` |  |  | opcao, branco ou nulo. |
| `quantidade` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (assembleia_id, pergunta_id, opcao_id, tipo)`

Checks: `voto_resultado_final_tipo_check` `CHECK ((tipo = ANY (ARRAY['opcao'::text, 'branco'::text, 'nulo'::text])))`

Índices: `idx_voto_resultado_final_assembleia`, `voto_resultado_final_assembleia_id_pergunta_id_opcao_id_tip_key`, `voto_resultado_final_pkey`

## voto_resultado_presencial

Espelho de "VOTO Resultado presencial" do Bubble. Contagem agregada de votos presenciais por opção de resposta (não nominal).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `contagem_votos` | integer | sim |  |  |  |  |
| `resposta` | text | sim |  |  |  |  |
| `assembleia_id` | uuid | sim |  | → voto_assembleias |  |  |
| `pergunta_id` | uuid | sim |  | → voto_assembleias_perguntas |  |  |
| `opcao_resposta_id` | uuid | sim |  | → voto_opcoes_resposta |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `voto_resultado_presencial_bubble_id_key`, `voto_resultado_presencial_pkey`

## voto_rod_assembleias

Rodada de votação (período) dentro de uma campanha, dona das perguntas, da lista de aptos e das assembleias. Veio do Bubble; tela Representação > Votações > Rodadas.

- **LGPD:** identificação · titulares: eleitores (ids legados)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `nome_assembleia` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `codigo` | text | sim |  |  |  |  |
| `apuracao_encerrada` | boolean | sim |  |  |  |  |
| `card_grafico_url` | text | sim |  |  |  |  |
| `edital_url` | text | sim |  |  |  |  |
| `contador_votos` | numeric | sim |  |  |  |  |
| `periodo_raw` | text | sim |  |  |  | Período em texto do Bubble; normalizado em inicio e termino. |
| `termino` | date | sim |  |  |  |  |
| `video_indicativo_url` | text | sim |  |  |  |  |
| `campanha_id` | uuid | sim |  | → voto_campanha |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `empresas_raw` | jsonb | sim |  |  |  | bubble_ids das empresas no legado. |
| `assembleias_raw` | jsonb | sim |  |  |  | bubble_ids das assembleias no legado. |
| `funcionarios_raw` | jsonb | sim |  |  | identificação | Lista de bubble_ids de funcionários aptos no legado; pseudônimo de pessoas. |
| `perguntas_raw` | jsonb | sim |  |  |  | bubble_ids das perguntas no legado. |
| `perguntas1_raw` | text[] | sim |  |  |  |  |
| `unidades_bases_raw` | jsonb | sim |  |  |  | bubble_ids das unidades presenciais no legado. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `inicio` | date | sim |  |  |  |  |
| `clausula_filiacao_coletiva` | boolean | não | `false` |  |  | A rodada vota cláusula de filiação coletiva; gera filiações após o prazo. |
| `filiacao_coletiva_dias` | integer | sim |  |  |  | Prazo em dias para desistência da filiação coletiva. |
| `aviso_auto_horas` | smallint | sim |  |  |  | Antecedência em horas do aviso automático por e-mail aos aptos. |
| `contatos_reter_dias` | smallint | não | `90` |  |  | Dias, contados do encerramento da apuração da última assembleia, que os contatos dos aptos ficam guardados (prazo de impugnação). Padrão 90. |
| `contatos_expurgados_em` | timestamp with time zone | sim |  |  |  | Quando votacao_expurgar_contatos() limpou os contatos dos aptos desta rodada. |
| `aviso_previo_dias` | smallint | sim |  |  |  | Envio automático do aviso prévio (teste de entrega) N dias antes da abertura da votação pela internet; null = desligado. |

Únicas: `UNIQUE (bubble_id)`

Checks: `voto_rod_assembleias_aviso_auto_horas_check` `CHECK (((aviso_auto_horas IS NULL) OR ((aviso_auto_horas >= 1) AND (aviso_auto_horas <= 720))))`; `voto_rod_assembleias_contatos_reter_dias_check` `CHECK (((contatos_reter_dias >= 7) AND (contatos_reter_dias <= 3650)))`

Índices: `idx_voto_rod_campanha`, `voto_rod_assembleias_aviso_auto_idx`, `voto_rod_assembleias_bubble_id_key`, `voto_rod_assembleias_pkey`

## voto_unidades_presenciais

Unidades ou bases de votação presencial por empresa e rodada, vindas do Bubble. Sem uso encontrado no código além da lista de tabelas do tenant (possível legado do Bubble), vazia.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `empresa_id` | uuid | sim |  | → empresa |  |  |
| `unidade_presencial` | text | sim |  |  |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_assembleias |  |  |
| `votacao_id` | uuid | sim |  | → voto_assembleia_resultados |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `voto_unidades_presenciais_bubble_id_key`, `voto_unidades_presenciais_pkey`

## voto_urna

Urna do Bubble (local, número, lacres). Sem uso encontrado no código (possível legado do Bubble), vazia; substituída por voto_urnas.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `local_urna` | text | sim |  |  |  |  |
| `eletronica` | boolean | sim | `false` |  |  |  |
| `numero_urna` | text | sim |  |  |  |  |
| `lacres_principais` | text[] | sim |  |  |  |  |
| `assembleia_id` | uuid | sim |  | → voto_assembleias |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `voto_urna_bubble_id_key`, `voto_urna_pkey`

## voto_urna_disponibilidade

Espelho de "VOTO Urna disponibilidade" do Bubble. Schema-only (0 registros no Bubble).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `abertura` | date | sim |  |  |  |  |
| `fechamento` | date | sim |  |  |  |  |
| `lacre_boca_urna` | text | sim |  |  |  |  |
| `lacre_principal` | text | sim |  |  |  |  |
| `urna_id` | uuid | sim |  | → voto_urna |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `voto_urna_disponibilidade_bubble_id_key`, `voto_urna_disponibilidade_pkey`

## voto_urna_eventos

Eventos da ata de uma urna: instalação, abertura, fechamento, encerramento e anomalias, com quem operou e o primeiro eleitor que atesta o lacre rompido.

- **LGPD:** identificação, **sensível: sindical** · titulares: eleitores e mesários
- **RLS:** ligado · policies: `voto_urna_eventos_tenant`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `urna_id` | uuid | não |  | → voto_urnas |  |  |
| `tipo` | text | não |  |  |  |  |
| `data` | timestamp with time zone | não | `now()` |  |  |  |
| `mesario_id` | uuid | sim |  | → voto_mesarios |  |  |
| `apurador_id` | uuid | sim |  | → voto_apuradores |  |  |
| `primeiro_eleitor_nome` | text | sim |  |  | **sensível: sindical** | Nome do primeiro eleitor do dia; revela participação na votação. |
| `atesta_lacre_rompido` | boolean | sim |  |  |  |  |
| `lacre_boca_numero` | text | sim |  |  |  |  |
| `descricao` | text | sim |  |  | identificação | Texto livre de anomalias; pode citar pessoas. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `voto_urna_eventos_tipo_check` `CHECK ((tipo = ANY (ARRAY['instalacao'::text, 'abertura'::text, 'fechamento'::text, 'encerramento'::text, 'anomalia'::text])))`

Índices: `idx_voto_urna_eventos_urna`, `voto_urna_eventos_pkey`

## voto_urna_lacres

Controle dos lacres (boca e principal) de uma urna física: número de série, instalação, rompimento e guarda dentro da urna.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `voto_urna_lacres_tenant`
- **Triggers:** `voto_urna_lacres_imutavel` → `voto_urna_lacres_imutavel`, `voto_urna_lacres_imutavel_truncate` → `voto_urna_lacres_imutavel`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `urna_id` | uuid | não |  | → voto_urnas |  |  |
| `tipo` | text | não |  |  |  |  |
| `numero` | text | não |  |  |  |  |
| `evento` | text | não |  |  |  |  |
| `data` | timestamp with time zone | não | `now()` |  |  |  |
| `guardado_na_urna` | boolean | não | `false` |  |  |  |
| `observacao` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `anulado_em` | timestamp with time zone | sim |  |  |  | Quando o registro do lacre foi anulado (lançado errado). O lacre não se apaga: anulado, continua no histórico e sai das conferências (R-6). |
| `anulado_motivo` | text | sim |  |  |  | Por que o registro do lacre foi anulado (ao menos 5 caracteres). |
| `anulado_por` | uuid | sim |  |  | identificação | Usuário do painel que anulou o registro do lacre. |

Checks: `voto_urna_lacres_evento_check` `CHECK ((evento = ANY (ARRAY['instalado'::text, 'rompido'::text])))`; `voto_urna_lacres_tipo_check` `CHECK ((tipo = ANY (ARRAY['boca'::text, 'principal'::text])))`

Índices: `idx_voto_urna_lacres_urna`, `voto_urna_lacres_pkey`

## voto_urna_terminais

Terminal de votação pareado a uma urna digital. O mesário libera a cédula para um apto ou eleitor em separado; o voto é gravado sem ligar ao apto e a liberação é limpa em seguida.

- **LGPD:** **credencial (nunca exportar)**, **sensível: sindical** · titulares: eleitores
- **RLS:** ligado · policies: `voto_urna_terminais_tenant`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `urna_id` | uuid | sim |  | → voto_urnas |  |  |
| `codigo` | text | não |  |  |  | Código de pareamento do terminal com a urna. |
| `sessao_token` | text | não |  |  | **credencial (nunca exportar)** | Token da sessão do terminal. |
| `pareada` | boolean | não | `false` |  |  |  |
| `apto_liberado_id` | uuid | sim |  | → voto_assembleias_aptos | **sensível: sindical** | Apto com cédula liberada no momento; limpo após o voto. |
| `liberado_em` | timestamp with time zone | sim |  |  |  |  |
| `encerrada` | boolean | não | `false` |  |  |  |
| `criado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `atualizado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `em_separado_liberado_id` | uuid | sim |  | → voto_em_separado | **sensível: sindical** |  |

Índices: `idx_voto_urna_terminais_codigo`, `idx_voto_urna_terminais_urna`, `voto_urna_terminais_pkey`

## voto_urnas

Urna física ou digital de uma assembleia presencial, com janela de abertura/fechamento e apurador atribuído.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `voto_urnas_tenant`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `assembleia_id` | uuid | não |  | → voto_assembleias |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `nome` | text | não |  |  |  |  |
| `tipo` | text | não | `'digital'::text` |  |  |  |
| `abertura` | timestamp with time zone | sim |  |  |  |  |
| `fechamento` | timestamp with time zone | sim |  |  |  |  |
| `ativa` | boolean | não | `true` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `apurador_id` | uuid | sim |  | → voto_apuradores |  |  |

Checks: `voto_urnas_tipo_check` `CHECK ((tipo = ANY (ARRAY['fisica'::text, 'digital'::text])))`

Índices: `idx_voto_urnas_assembleia`, `voto_urnas_pkey`

## voto_votacao_respostas

Espelho de "Assembleias - Votações - Respostas" do Bubble (slug assembleias___perguntas___respostas). Tabela LEGADA -- versão anterior de voto_online.

- **LGPD:** **sensível: sindical**, identificação · titulares: eleitores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `eleitor_id` | uuid | sim |  | → usuarios | **sensível: sindical** | Se preenchido, liga a pessoa ao conteúdo do voto. Tabela vazia; só consultada para impedir excluir assembleia com votos. |
| `pergunta_id` | uuid | sim |  | → voto_assembleias_perguntas |  |  |
| `resposta` | text | sim |  |  | **sensível: sindical** | Campo texto livre "Resposta (!)" do Bubble |
| `ip_codigo` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `ip_localidade` | text | sim |  |  | identificação |  |
| `votou` | boolean | sim |  |  | **sensível: sindical** |  |
| `valido` | boolean | sim |  |  |  |  |
| `resposta_opcao` | text | sim |  |  | **sensível: sindical** | Option set "RESPOSTA" (Assembleia voto) do Bubble -- legado, substituído por voto_opcoes_resposta no sistema novo |
| `assembleia_id` | uuid | sim |  | → voto_assembleias |  |  |
| `rod_assembleia_id` | uuid | sim |  | → voto_rod_assembleias |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` | → empresa |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `assembleia_votacao_respostas_bubble_id_key`, `assembleia_votacao_respostas_pkey`
