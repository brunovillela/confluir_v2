<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Plataforma, acesso e auditoria

42 tabelas. Diagrama: [er/plataforma.md](../er/plataforma.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [acesso_agente_comandos](#acesso_agente_comandos) | — | Fila de comandos para o agente da sede: o painel pede, o agente busca no contato seguinte e devolve o resultado. Nesta etapa só "verificar". |
| [acesso_agentes](#acesso_agentes) | **credencial (nunca exportar)** | Agente do controle de acesso instalado no computador da recepção de uma sede (lib/acesso-agente.ts): pareamento por código, token, último co… |
| [acessos_revisao_ciclos](#acessos_revisao_ciclos) | identificação | Campanha de revisão periódica de acessos (Gestão › Usuários › Revisão de acessos, 20/11/2026): quando abriu, prazo e quando encerrou. |
| [acessos_revisao_itens](#acessos_revisao_itens) | identificação | Cada pessoa com acesso ao painel numa revisão periódica: quem revisa (coordenador do departamento ou a Gestão), o retrato do acesso, a decis… |
| [analitica_atualizacoes](#analitica_atualizacoes) | — | Controle técnico da última atualização de cada visão materializada analítica (fato_filiacao_mensal, fato_frota_mensal etc.) e quanto tempo l… |
| [api_chaves](#api_chaves) | **credencial (nunca exportar)** | Chave de acesso à API pública do tenant (lib/api-publica.ts): guarda só o prefixo e o hash, escopos permitidos, uso e revogação. |
| [api_requisicoes](#api_requisicoes) | identificação | Log de cada requisição à API pública /api/v1 (achado M6 da RIPD da base multi-entidade): chave, rota, parâmetros, status HTTP e quantidade d… |
| [auditoria](#auditoria) | **sensível: sindical**, financeiro, trabalhista, identificação, **credencial (nunca exportar)** | Trilha genérica gravada pelo trigger registrar_auditoria: cada linha é uma inclusão, alteração ou exclusão em tabela sensível (usuarios, fil… |
| [auditoria_regras](#auditoria_regras) | — | Configuração por tenant das regras de auditoria automática das ordens de pagamento: para cada origem e código de regra, a severidade e os pa… |
| [auth_codigos_envios](#auth_codigos_envios) | identificação | Registro de cada envio de código de acesso por e-mail (lib/codigo-acesso.ts), usado para limitar a frequência de envios por endereço. |
| [auth_identidades](#auth_identidades) | identificação | Quem é a conta Supabase Auth no tenant (CPF do filiado ou do trabalhador não filiado). Só o servidor grava, após prova de posse do e-mail. |
| [auth_vinculos_pendentes](#auth_vinculos_pendentes) | identificação | Par e-mail↔CPF derivado pelo servidor antes de enviar o código de acesso; consumido após o código ser conferido. Expira junto com o código. |
| [email_bloqueios](#email_bloqueios) | identificação | Endereços de e-mail que o sistema não usa mais (Gestão › E-mail, 26/11/2026): rejeição definitiva informada pelo provedor ou bloqueio à mão.… |
| [email_config](#email_config) | **credencial (nunca exportar)** | Configuração do e-mail da entidade (Gestão › E-mail): controles (módulos desligados, teto mensal, cotas por departamento; 26/11/2026) e a co… |
| [email_envios](#email_envios) | identificação | Uma linha por e-mail enviado pelo sistema (src/lib/email.ts): processo, módulo, quem disparou, departamento, destinatário, provedor, situaçã… |
| [empresa](#empresa) | identificação | Cadastro único de organizações: tenants (sindicatos), empregadores e fontes pagadoras, fundos de pensão, fornecedores, conveniados e entidad… |
| [empresa_contatos](#empresa_contatos) | identificação, trabalhista | Pessoas de contato de fornecedores e empregadores (nome, cargo, telefone, e-mail), mantidas na ficha do fornecedor. A marca recebe_ordem_com… |
| [empresa_departamentos](#empresa_departamentos) | — | Departamentos da entidade (secretarias, setores), com coordenador. Usados em compras, ofícios, agenda, contas e avisos. Departamento legado … |
| [empresa_departamentos_integrantes](#empresa_departamentos_integrantes) | trabalhista | Usuários que integram cada departamento da entidade. Usado em avisos, permissões e diárias da diretoria. |
| [empresa_sede](#empresa_sede) | — | Sedes e subsedes da entidade com endereço e telefones. Usadas no rodapé dos ofícios, na agenda, em cobranças e na cessão de espaços. |
| [gestao_eventos](#gestao_eventos) | identificação | O que os administradores mudaram na Gestão (chave de IA cadastrada ou removida, teto, modelo, módulos desligados) e quem mudou. Só se acresc… |
| [ia_config](#ia_config) | **credencial (nunca exportar)** | Configuração da IA da entidade (Gestão › Inteligência Artificial, 19/11/2026): chave de API própria cifrada pela aplicação, modelo, teto men… |
| [ia_cota_avisos](#ia_cota_avisos) | — | Avisos de cota de IA já enviados por departamento, mês (AAAA-MM) e nível (80 ou 100), para não repetir (20/11/2026). |
| [ia_uso](#ia_uso) | identificação | Uma linha por chamada à IA (lib/ia.ts): quem pediu, processo, módulo, departamento, modelo, tokens, custo estimado e resultado. Não guarda o… |
| [lgpd_bloqueios_litigio](#lgpd_bloqueios_litigio) | identificação | Bloqueio por litígio (legal hold, item 4 da seção 4 de retencao.md): enquanto vigente, a pessoa (CPF ou e-mail) ou o registro (tabela + id) … |
| [lgpd_exportacoes](#lgpd_exportacoes) | identificação | Livro de exportações (achado M5 da RIPD da base multi-entidade): uma linha por arquivo com dado pessoal gerado no painel (planilha, PDF, CNA… |
| [lgpd_regras_retencao](#lgpd_regras_retencao) | identificação | Regras do motor de retenção (seção 4 de docs/lgpd/retencao.md): uma linha por entidade e código RT, com prazo padrão, mínimo legal, prazo es… |
| [lgpd_retencao_execucoes](#lgpd_retencao_execucoes) | identificação | Livro do motor de retenção: uma linha por regra executada (simulação ou real), com prazo, data de corte, linhas afetadas, arquivos removidos… |
| [lgpd_solicitacoes](#lgpd_solicitacoes) | identificação, **sensível: sindical** | Livro de solicitações de titulares. NÃO armazenar aqui nome, CPF ou contato — o objetivo é provar o tratamento, não preservar o dado. |
| [login_tentativas](#login_tentativas) | identificação | Contador de falhas de login e de envio de código por chave (lib/login-bloqueio.ts e portal/votacao), com bloqueio temporário após 5 ou 10 fa… |
| [perfil_permissoes](#perfil_permissoes) | — | Chave de permissão concedida a um perfil de acesso (RBAC por cima da ACL plana). |
| [perfis](#perfis) | — | Perfil de acesso do tenant (ex.: Recepção, Financeiro), agrupando permissões e alçada de aprovação. |
| [permissoes](#permissoes) | — | ACL plana por usuário: uma coluna booleana por área/ação do sistema, mais alçada de aprovação. Migrada do Bubble; editada em Configurações >… |
| [permissoes_compras_depto](#permissoes_compras_depto) | — | Junção N:N: departamentos cujas compras o usuário da permissão pode ver (lib/db/departamentos.ts). |
| [plataforma_admins](#plataforma_admins) | identificação | Operadores da plataforma (super-admin). Acessam /admin independentemente do tenant; NÃO são governados pelas permissões de tenant. |
| [tenants](#tenants) | — | Organizações servidas pela plataforma. empresa_id é o registro cujo id vira emp_proprietaria_id nos dados do tenant. slug = subdomínio de ac… |
| [usuario_perfis](#usuario_perfis) | — | Atribuição de perfis de acesso (RBAC) a usuários do sistema. |
| [usuarios](#usuarios) | identificação, **sensível: sindical**, trabalhista, **credencial (nunca exportar)** | Pessoas do sistema: funcionários, diretores, filiados com login, condutores e contas de função. Dados de identificação, vínculo, preferência… |
| [usuarios_ocupacoes](#usuarios_ocupacoes) | trabalhista | Quem ocupou cada conta de função (ex.: Recepção) e em que período, com motivo e observação. |
| [usuarios_unificacoes](#usuarios_unificacoes) | identificação, **sensível: sindical** | Registro de cada unificação de duas contas de usuário da mesma pessoa pela função unificar_usuarios: estado anterior das duas contas, o que … |
| [webhooks](#webhooks) | **credencial (nunca exportar)** | Webhooks cadastrados pela entidade para receber eventos (ordem autorizada ou paga, filiação aprovada, cobrança paga, retorno bancário), assi… |
| [webhooks_entregas](#webhooks_entregas) | **sensível: sindical**, financeiro, identificação | Fila e histórico de entregas de cada evento a cada webhook, com corpo enviado, tentativas e último status HTTP. |

## acesso_agente_comandos

Fila de comandos para o agente da sede: o painel pede, o agente busca no contato seguinte e devolve o resultado. Nesta etapa só "verificar".

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `agente_id` | uuid | não |  | → acesso_agentes (**cascade**) |  |  |
| `tipo` | text | não |  |  |  | Comando: verificar (roda a lista de verificação da conexão). |
| `situacao` | text | não | `'pendente'::text` |  |  | pendente → entregue (o agente buscou) → concluido ou falhou. |
| `resultado` | jsonb | sim |  |  |  | Resposta do agente ao comando. |
| `solicitado_por` | uuid | sim |  |  |  | Usuário que pediu o comando. |
| `entregue_em` | timestamp with time zone | sim |  |  |  |  |
| `concluido_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `acesso_agente_comandos_situacao_check` `CHECK ((situacao = ANY (ARRAY['pendente'::text, 'entregue'::text, 'concluido'::text, 'falhou'::text])))`; `acesso_agente_comandos_tipo_check` `CHECK ((tipo = 'verificar'::text))`

Índices: `acesso_agente_comandos_fila_idx`, `acesso_agente_comandos_pkey`

## acesso_agentes

Agente do controle de acesso instalado no computador da recepção de uma sede (lib/acesso-agente.ts): pareamento por código, token, último contato e diagnóstico da conexão com o sistema de catracas.

- **LGPD:** **credencial (nunca exportar)**
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `sede_id` | uuid | sim |  | → empresa_sede (set null) |  | Sede (empresa_sede) atendida pelo agente. |
| `nome` | text | não |  |  |  | Nome do agente na tela, ex.: "Recepção — Macaé". |
| `conector` | text | não | `'simulado'::text` |  |  | Sistema de catracas com que o agente conversa: simulado (testes, sem catraca) ou controlid_local (servidor Control iD da sede). |
| `codigo_hash` | text | sim |  |  | **credencial (nunca exportar)** | Hash do código de pareamento de 6 dígitos; vale até codigo_expira_em e é apagado ao parear. |
| `codigo_expira_em` | timestamp with time zone | sim |  |  |  | Validade do código de pareamento (15 minutos). |
| `token_hash` | text | sim |  |  | **credencial (nunca exportar)** | Hash do token do agente; o segredo em claro fica só no computador da sede. |
| `token_prefixo` | text | sim |  |  | **credencial (nunca exportar)** | Início visível do token, para identificá-lo. |
| `pareado_em` | timestamp with time zone | sim |  |  |  | Quando o agente foi pareado com o código. |
| `ultimo_contato_em` | timestamp with time zone | sim |  |  |  | Último contato do agente (a cada poucos segundos quando ligado). |
| `versao` | text | sim |  |  |  | Versão do agente informada no contato. |
| `maquina` | text | sim |  |  |  | Nome do computador e sistema operacional informados pelo agente. |
| `diagnostico` | jsonb | sim |  |  |  | Última lista de verificação devolvida pelo agente: [{id, ok, detalhe}] (servidor, login, permissão, teste). |
| `diagnostico_em` | timestamp with time zone | sim |  |  |  | Quando o diagnóstico foi feito. |
| `criado_por` | uuid | sim |  |  |  | Usuário que cadastrou o agente. |
| `revogado_em` | timestamp with time zone | sim |  |  |  | Quando o agente foi desligado; o token deixa de valer. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (token_hash)`

Checks: `acesso_agentes_conector_check` `CHECK ((conector = ANY (ARRAY['simulado'::text, 'controlid_local'::text])))`

Índices: `acesso_agentes_codigo_idx`, `acesso_agentes_emp_idx`, `acesso_agentes_pkey`, `acesso_agentes_token_hash_key`

## acessos_revisao_ciclos

Campanha de revisão periódica de acessos (Gestão › Usuários › Revisão de acessos, 20/11/2026): quando abriu, prazo e quando encerrou.

- **LGPD:** identificação · titulares: funcionarios
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `titulo` | text | não |  |  | nenhum | Nome da campanha (ex.: 4º trimestre de 2026). |
| `aberto_em` | timestamp with time zone | não | `now()` |  |  |  |
| `aberto_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem abriu a revisão. |
| `prazo` | date | não |  |  | nenhum | Data-limite para os coordenadores responderem. |
| `encerrado_em` | timestamp with time zone | sim |  |  |  |  |
| `encerrado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem encerrou a revisão. |

Índices: `acessos_revisao_ciclos_emp_idx`, `acessos_revisao_ciclos_pkey`, `acessos_revisao_ciclos_um_aberto`

## acessos_revisao_itens

Cada pessoa com acesso ao painel numa revisão periódica: quem revisa (coordenador do departamento ou a Gestão), o retrato do acesso, a decisão e o que a Gestão fez (20/11/2026).

- **LGPD:** identificação · titulares: funcionarios
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `ciclo_id` | uuid | não |  | → acessos_revisao_ciclos (**cascade**) |  |  |
| `usuario_id` | uuid | não |  | → usuarios (**cascade**) | identificação | Pessoa cujo acesso está sendo revisado. |
| `departamento_id` | uuid | sim |  | → empresa_departamentos (set null) | nenhum | Departamento pelo qual o coordenador revisa; nulo quando a Gestão revisa direto. |
| `revisor_id` | uuid | sim |  | → usuarios (set null) | identificação | Coordenador que confirma; nulo = a Gestão (sem coordenador, ou a pessoa é o próprio coordenador). |
| `acesso_resumo` | jsonb | não | `'{}'::jsonb` |  | nenhum | Retrato do acesso quando a revisão abriu: {"perfis": [nomes], "diretas": [rótulos das permissões diretas], "total": n}. |
| `decisao` | text | sim |  |  | nenhum | manter, retirar ou ajustar; nulo = sem resposta. |
| `observacao` | text | sim |  |  | identificação | O que ajustar, ou o motivo, nas palavras do revisor. |
| `decidido_em` | timestamp with time zone | sim |  |  |  |  |
| `decidido_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem respondeu. |
| `tratado_em` | timestamp with time zone | sim |  |  |  |  |
| `tratado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem da Gestão resolveu (revogou, ajustou ou manteve). |
| `tratamento` | text | sim |  |  | nenhum | O que a Gestão fez, em poucas palavras. |

Únicas: `UNIQUE (ciclo_id, usuario_id)`

Checks: `acessos_revisao_itens_decisao_valida` `CHECK (((decisao IS NULL) OR (decisao = ANY (ARRAY['manter'::text, 'retirar'::text, 'ajustar'::text]))))`

Índices: `acessos_revisao_itens_ciclo_idx`, `acessos_revisao_itens_pkey`, `acessos_revisao_itens_revisor_idx`, `acessos_revisao_itens_unico`

## analitica_atualizacoes

Controle técnico da última atualização de cada visão materializada analítica (fato_filiacao_mensal, fato_frota_mensal etc.) e quanto tempo levou.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `fato` | text | não |  |  |  | Nome da visão materializada atualizada. |
| `atualizado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `duracao_ms` | integer | sim |  |  |  |  |

Índices: `analitica_atualizacoes_pkey`

## api_chaves

Chave de acesso à API pública do tenant (lib/api-publica.ts): guarda só o prefixo e o hash, escopos permitidos, uso e revogação.

- **LGPD:** **credencial (nunca exportar)**
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `nome` | text | não |  |  |  |  |
| `prefixo` | text | não |  |  | **credencial (nunca exportar)** | Início visível da chave, para identificá-la na lista. |
| `hash` | text | não |  |  | **credencial (nunca exportar)** | Hash da chave de API; o segredo em claro não é guardado. |
| `escopos` | text[] | não | `'{}'::text[]` |  |  | Endpoints que a chave pode ler: agenda, eventos, arrecadacao, despesas, filiados; filiados_cpf libera o CPF em /filiados (sem ele o campo volta nulo). /eu não exige escopo. |
| `criada_por` | uuid | sim |  |  |  |  |
| `ultimo_uso_em` | timestamp with time zone | sim |  |  |  |  |
| `usos` | bigint | não | `0` |  |  |  |
| `revogada_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (hash)`

Checks: `api_chaves_escopos_validos` `CHECK ((escopos <@ ARRAY['agenda'::text, 'eventos'::text, 'arrecadacao'::text, 'despesas'::text, 'filiados'::text, 'filiados_cpf'::text]))`

Índices: `api_chaves_emp_idx`, `api_chaves_hash_key`, `api_chaves_pkey`

## api_requisicoes

Log de cada requisição à API pública /api/v1 (achado M6 da RIPD da base multi-entidade): chave, rota, parâmetros, status HTTP e quantidade de linhas devolvidas, inclusive as recusadas (chave errada, sem escopo, limite). Gravado só pelo service_role (src/lib/api-publica.ts); a entidade lê em Institucional › Auditoria.

- **LGPD:** identificação · titulares: sistemas e pessoas que usam a chave de API da entidade
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | bigint | não |  |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `chave_id` | uuid | sim |  | → api_chaves (set null) |  | Chave usada; nulo quando a chave apresentada não existe. |
| `metodo` | text | não | `'GET'::text` |  |  |  |
| `rota` | text | não |  |  |  | Caminho pedido (ex.: /api/v1/filiados). |
| `parametros` | jsonb | não | `'{}'::jsonb` |  | identificação | Query string da requisição, sem a chave. A busca livre pode conter um nome. |
| `status` | integer | não |  |  |  | Status HTTP devolvido. |
| `quantidade` | integer | sim |  |  |  | Linhas devolvidas na resposta (nulo quando não há lista). |
| `origem_ip` | text | sim |  |  | identificação | IP de origem (x-forwarded-for), para identificar uso da chave fora do lugar esperado. |
| `duracao_ms` | integer | sim |  |  |  | Tempo de resposta em milissegundos. |
| `created_at` | timestamp with time zone | não | `now()` |  |  | Quando a requisição chegou. |

Índices: `api_requisicoes_pkey`, `idx_api_requisicoes_chave`, `idx_api_requisicoes_emp`

## auditoria

Trilha genérica gravada pelo trigger registrar_auditoria: cada linha é uma inclusão, alteração ou exclusão em tabela sensível (usuarios, filiacoes, filiacao_vinculos, dados_bancarios, fornecedores, ordens_pagamento, contratos etc.), com os campos alterados antes e depois.

- **LGPD:** **sensível: sindical**, financeiro, trabalhista, identificação, **credencial (nunca exportar)** · titulares: filiados, usuários do sistema, funcionários, diretores, fornecedores PF
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | bigint | não | `nextval('auditoria_id_seq'::regclass)` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  |  |  |  |
| `tabela` | text | não |  |  |  | Tabela auditada. |
| `registro_id` | text | sim |  |  |  | id do registro alterado na tabela auditada. |
| `operacao` | text | não |  |  |  |  |
| `campos` | text[] | sim |  |  |  | Nomes das colunas que mudaram no UPDATE. |
| `antes` | jsonb | sim |  |  | **sensível: sindical** | Valores anteriores dos campos alterados (linha inteira no DELETE). Pode conter filiação, dados bancários, CPF, cargo; só senha e códigos cifrados ou hash são ocultados, outros tokens de usuarios podem aparecer. |
| `depois` | jsonb | sim |  |  | **sensível: sindical** | Valores novos dos campos alterados (linha inteira no INSERT). Mesmo conteúdo potencial de antes. |
| `usuario_id` | uuid | sim |  |  | identificação | Usuário que fez a alteração, lido do cabeçalho x-confluir-usuario. |
| `papel` | text | sim |  |  |  | Papel do JWT: authenticated, service_role ou anon. |
| `momento` | timestamp with time zone | não | `now()` |  |  | Quando a alteração ocorreu. |

Checks: `auditoria_operacao_check` `CHECK ((operacao = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))`

Índices: `auditoria_emp_momento_idx`, `auditoria_pkey`, `auditoria_registro_idx`, `auditoria_usuario_idx`

## auditoria_regras

Configuração por tenant das regras de auditoria automática das ordens de pagamento: para cada origem e código de regra, a severidade e os parâmetros. Editada na tela de regras de auditoria do Financeiro.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `origem` | text | não |  |  |  | Origem da ordem a que a regra se aplica (compra, contrato, diária, reembolso etc.). |
| `codigo` | text | não |  |  |  | Identificador da regra de verificação. |
| `severidade` | text | não |  |  |  | Nível do apontamento gerado (ex.: bloqueio, alerta, desligada). |
| `parametros` | jsonb | não | `'{}'::jsonb` |  |  | Limites e opções da regra. |
| `atualizado_por` | uuid | sim |  | → usuarios |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, origem, codigo)`

Checks: `auditoria_regras_severidade_check` `CHECK ((severidade = ANY (ARRAY['aceitar'::text, 'alertar'::text, 'bloquear'::text])))`

Índices: `auditoria_regras_emp_proprietaria_id_origem_codigo_key`, `auditoria_regras_pkey`

## auth_codigos_envios

Registro de cada envio de código de acesso por e-mail (lib/codigo-acesso.ts), usado para limitar a frequência de envios por endereço.

- **LGPD:** identificação · titulares: filiados, eleitores, usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `email` | text | não |  |  | identificação |  |
| `enviado_em` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `auth_codigos_envios_email_idx`, `auth_codigos_envios_pkey`

## auth_identidades

Quem é a conta Supabase Auth no tenant (CPF do filiado ou do trabalhador não filiado). Só o servidor grava, após prova de posse do e-mail.

- **LGPD:** identificação · titulares: filiados, trabalhadores não filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `auth_user_id` | uuid | não |  |  |  |  |
| 🔑 `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `tipo` | text | não |  |  |  | Se a conta é de filiado ou de trabalhador não filiado. |
| `cpf` | text | não |  |  | identificação |  |
| `nome` | text | sim |  |  | identificação |  |
| `vinculada_em` | timestamp with time zone | não | `now()` |  |  |  |
| `vinculada_por` | text | não |  |  |  | Fluxo que fez o vínculo (ex.: código por e-mail). |

Checks: `auth_identidades_cpf_check` `CHECK ((cpf ~ '^[0-9]{11}$'::text))`; `auth_identidades_tipo_check` `CHECK ((tipo = ANY (ARRAY['filiado'::text, 'nao_filiado'::text])))`; `auth_identidades_vinculada_por_check` `CHECK ((vinculada_por = ANY (ARRAY['senha'::text, 'codigo'::text, 'migracao'::text])))`

Índices: `auth_identidades_cpf_unico`, `auth_identidades_pkey`

## auth_vinculos_pendentes

Par e-mail↔CPF derivado pelo servidor antes de enviar o código de acesso; consumido após o código ser conferido. Expira junto com o código.

- **LGPD:** identificação · titulares: filiados, trabalhadores não filiados
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `email` | text | não |  |  | identificação |  |
| `tipo` | text | não |  |  |  |  |
| `cpf` | text | não |  |  | identificação |  |
| `nome` | text | sim |  |  | identificação |  |
| `expira_em` | timestamp with time zone | não |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `auth_vinculos_pendentes_cpf_check` `CHECK ((cpf ~ '^[0-9]{11}$'::text))`; `auth_vinculos_pendentes_tipo_check` `CHECK ((tipo = ANY (ARRAY['filiado'::text, 'nao_filiado'::text])))`

Índices: `auth_vinculos_pendentes_email_idx`, `auth_vinculos_pendentes_pkey`

## email_bloqueios

Endereços de e-mail que o sistema não usa mais (Gestão › E-mail, 26/11/2026): rejeição definitiva informada pelo provedor ou bloqueio à mão. Liberar = apagar a linha.

- **LGPD:** identificação · titulares: filiados,funcionarios,fornecedores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `endereco` | text | não |  |  | identificação | Endereço bloqueado, em minúsculas. |
| `motivo` | text | sim |  |  | nenhum | Tipo e motivo curto da rejeição do provedor, ou o motivo informado no bloqueio à mão. |
| `origem` | text | não | `'rejeicao'::text` |  |  | rejeicao (webhook do provedor) ou manual (Gestão). |
| `criado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `criado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem bloqueou à mão; nulo quando veio do provedor. |

Checks: `email_bloqueios_endereco_minusculo` `CHECK ((endereco = lower(btrim(endereco))))`; `email_bloqueios_origem_valida` `CHECK ((origem = ANY (ARRAY['rejeicao'::text, 'manual'::text])))`

Índices: `email_bloqueios_emp_endereco_uniq`, `email_bloqueios_pkey`

## email_config

Configuração do e-mail da entidade (Gestão › E-mail): controles (módulos desligados, teto mensal, cotas por departamento; 26/11/2026) e a conta própria no Brevo ou no Resend, com a chave cifrada pela aplicação, remetente, nome e endereço de resposta (27/11/2026). Envios essenciais nunca são barrados.

- **LGPD:** **credencial (nunca exportar)** · titulares: funcionarios
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `modulos_desligados` | text[] | não | `'{}'::text[]` |  |  | Módulos (slug de src/lib/email-processos.ts) cujos e-mails não saem, exceto os essenciais. |
| `limite_mensal` | integer | sim |  |  |  | Teto de e-mails por mês (fuso de Brasília); nulo = sem teto. |
| `bloquear_no_limite` | boolean | não | `false` |  |  | true = no teto (ou na cota do departamento) os e-mails não essenciais param até o dia 1º; false = só avisa. |
| `cotas_departamento` | jsonb | não | `'{}'::jsonb` |  |  | Cota mensal de e-mails por departamento (id → quantidade), contada pelo departamento de quem disparou. |
| `atualizado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem mudou a configuração por último. |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `provedor` | text | sim |  |  |  | Provedor da conta própria da entidade: brevo ou resend; nulo = conta da plataforma. |
| `chave_cifrada` | text | sim |  |  | **credencial (nunca exportar)** | Chave de API da conta própria, cifrada na aplicação (src/lib/segredos.ts, AES-256-GCM, com a entidade como dado associado). Nunca volta para a tela. |
| `chave_versao` | integer | sim |  |  |  | Versão da chave de cifra usada (0 = derivada, 1 = SEGREDOS_CHAVE). |
| `chave_final` | text | sim |  |  |  | Os 4 últimos caracteres da chave, para a Gestão reconhecer qual está cadastrada. |
| `chave_definida_em` | timestamp with time zone | sim |  |  |  | Quando a chave foi cadastrada. |
| `chave_definida_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem cadastrou a chave. |
| `chave_testada_em` | timestamp with time zone | sim |  |  |  | Último teste da chave (na hora de salvar, no botão Testar ou no teste diário). |
| `chave_teste_erro` | text | sim |  |  | nenhum | Erro do último teste ou da última recusa do provedor; nulo = funcionou. |
| `remetente_email` | text | sim |  |  |  | Remetente próprio (endereço de um domínio verificado na conta da entidade); nulo = remetente da plataforma. |
| `remetente_nome` | text | sim |  |  |  | Nome de exibição do remetente; nulo = "Confluir — <entidade>". |
| `responder_para` | text | sim |  |  |  | Endereço para onde vão as respostas; nulo = e-mail de contato da entidade (Organização). |
| `webhook_token_hash` | text | sim |  |  | **credencial (nunca exportar)** | sha-256 do token que o webhook da conta da entidade manda para /api/webhooks/brevo; o token em si só aparece uma vez, ao ser gerado. |
| `webhook_token_final` | text | sim |  |  |  | Os 4 últimos caracteres do token do webhook. |

Checks: `email_config_limite_positivo` `CHECK (((limite_mensal IS NULL) OR (limite_mensal > 0)))`; `email_config_provedor_valido` `CHECK (((provedor IS NULL) OR (provedor = ANY (ARRAY['brevo'::text, 'resend'::text]))))`

Índices: `email_config_pkey`

## email_envios

Uma linha por e-mail enviado pelo sistema (src/lib/email.ts): processo, módulo, quem disparou, departamento, destinatário, provedor, situação e os eventos do provedor (entrega, adiamento, rejeição). Não guarda assunto nem corpo (Gestão, 23/11/2026).

- **LGPD:** identificação · titulares: filiados,funcionarios,fornecedores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `criado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `processo` | text | não |  |  |  | Identificador do processo que enviou (catálogo em src/lib/email-processos.ts), ex.: acesso.codigo. |
| `modulo` | text | não |  |  |  | Módulo do processo (slug do catálogo), ex.: acesso, votacao, compras. |
| `detalhe` | text | sim |  |  | nenhum | Complemento técnico do processo, sem dado pessoal (ex.: o evento do aviso do sistema). |
| `usuario_id` | uuid | sim |  | → usuarios (set null) | identificação | Quem estava logado quando o e-mail saiu; nulo em tarefa agendada ou fluxo público. |
| `departamento_id` | uuid | sim |  | → empresa_departamentos (set null) |  | Departamento de quem disparou, no momento do envio (o principal marcado na Gestão; senão o que coordena; senão o primeiro). |
| `destinatario` | text | sim |  |  | identificação | Endereço de e-mail do destinatário; apagado depois de 1 ano pelo motor de retenção (RT38). |
| `dominio` | text | sim |  |  | nenhum | Domínio do destinatário (ex.: petrobras.com.br), que fica depois da retenção para as estatísticas de entrega. |
| `provedor` | text | não |  |  |  | Provedor usado: brevo, resend ou nenhum (envio não configurado neste ambiente). |
| `situacao` | text | não | `'enviando'::text` |  |  | enviando (antes da resposta do provedor), enviado (aceito pelo provedor), falhou, sem_configuracao (ambiente sem chave), teste (sandbox, não entregue) ou barrado (não enviado por trava da Gestão: módulo desligado, teto, cota ou endereço bloqueado; o motivo vai em erro). |
| `erro` | text | sim |  |  | nenhum | Motivo curto da falha do envio (código HTTP ou erro de rede), nunca o conteúdo. |
| `anexos` | integer | não | `0` |  |  | Quantos arquivos foram anexados. |
| `entregue_em` | timestamp with time zone | sim |  |  |  | Brevo: quando o servidor do destinatário aceitou o e-mail. |
| `adiado_em` | timestamp with time zone | sim |  |  |  | Brevo: último adiamento (soft bounce ou caixa cheia); o provedor ainda tenta de novo. |
| `rejeitado_em` | timestamp with time zone | sim |  |  |  | Brevo: rejeição definitiva (hard bounce, endereço inválido, bloqueado ou marcado como spam). |
| `rejeicao` | text | sim |  |  | nenhum | Brevo: tipo e motivo curto da rejeição definitiva. |
| `conta` | text | sim |  |  |  | De que conta o e-mail saiu: entidade (chave própria, Gestão › E-mail) ou plataforma. Nulo nos envios anteriores a 27/11/2026 (todos da plataforma). |

Checks: `email_envios_conta_valida` `CHECK (((conta IS NULL) OR (conta = ANY (ARRAY['entidade'::text, 'plataforma'::text]))))`; `email_envios_provedor_valido` `CHECK ((provedor = ANY (ARRAY['brevo'::text, 'resend'::text, 'nenhum'::text])))`; `email_envios_situacao_valida` `CHECK ((situacao = ANY (ARRAY['enviando'::text, 'enviado'::text, 'falhou'::text, 'sem_configuracao'::text, 'teste'::text, 'barrado'::text])))`

Índices: `email_envios_emp_data_idx`, `email_envios_emp_destinatario_idx`, `email_envios_pkey`

## empresa

Cadastro único de organizações: tenants (sindicatos), empregadores e fontes pagadoras, fundos de pensão, fornecedores, conveniados e entidades apoiadas, distinguidos por marcas booleanas. Inclui fornecedores pessoa física identificados por CPF.

- **LGPD:** identificação · titulares: fornecedores PF
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`, `trg_fornecedores_updated_at` → `set_updated_at`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `tipo` | text | sim |  |  |  | Tipo de organização herdado do Bubble. |
| `cnpj_cpf` | text | sim |  |  | identificação | CNPJ ou, para fornecedor pessoa física, CPF. |
| `empresa` | boolean | sim | `false` |  |  |  |
| `bloqueado` | boolean | sim | `false` |  |  |  |
| `locadora_veiculos` | boolean | sim | `false` |  |  |  |
| `conveniador` | boolean | sim | `false` |  |  | Empresa que oferece convênio aos filiados. |
| `pessoa_juridica` | boolean | sim | `false` |  |  |  |
| `fundo_pensao` | boolean | sim | `false` |  |  |  |
| `fornecedor_bloqueado` | boolean | sim | `false` |  |  |  |
| `beneficiario_ajuda` | boolean | sim | `false` |  |  | Pode receber ajudas institucionais. |
| `trabalhadores_rep_nf` | boolean | sim | `false` |  |  | Marca empresas com trabalhadores representados pelo Sindipetro-NF. |
| `quantidade_trabalhadores` | integer | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `nome_fantasia` | text | sim |  |  | identificação |  |
| `nome_razao` | text | sim |  |  | identificação | Razão social ou nome da pessoa física. |
| `logomarca` | text | sim |  |  |  |  |
| `foto` | text | sim |  |  | identificação |  |
| `inativa_data` | date | sim |  |  |  |  |
| `inativa` | boolean | sim | `false` |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `site_url` | text | sim |  |  |  | Site institucional público da organização (link no painel). |
| `email_contato` | text | sim |  |  | identificação | E-mail de contato/encarregado (exibido na política de privacidade — LGPD). |
| `noticias_url` | text | sim |  |  |  | Página HTML de notícias para o widget do painel (fallback quando a tabela `noticias` está vazia). Opcional. |
| `noticias_feed_url` | text | sim |  |  |  | Feed RSS de notícias para o widget do painel (fallback). Opcional. |
| `entidade_apoiada` | boolean | sim | `false` |  |  | Entidade que recebe apoio/ajuda da entidade. |
| `sst_rotina_frequencia` | text | não | `'mensal'::text` |  |  | Frequência da rotina de saúde e segurança do trabalho do tenant. |
| `filiacao_exige_fonte` | boolean | não | `true` |  |  | Se true, todo recebimento de filiado fica vinculado a uma fonte pagadora, qualquer que seja a forma de recebimento. |
| `mesclado_em_id` | uuid | sim |  | → empresa |  | Cadastro que incorporou este (mescla de fornecedor duplicado). Este fica inativo; os registros foram movidos para lá. |
| `mesclado_em` | timestamp with time zone | sim |  |  |  |  |
| `mesclado_por` | uuid | sim |  | → usuarios |  |  |
| `filiacao_saude_config` | jsonb | sim |  |  |  | Saúde dos cadastros: por categoria de fonte, o peso da falta de cada informação (pendencia, apontamento ou normal). null = padrão. |
| `fonte_categoria_id` | uuid | sim |  | → fonte_categorias (set null) |  | Categoria da fonte pagadora criada pela entidade; null = Empregador ou Fundo de pensão pela marca fundo_pensao. |
| `marketplace` | boolean | não | `false` |  |  |  |
| `lgpd_encarregado_nome` | text | sim |  |  | identificação | Nome do encarregado pelo tratamento de dados pessoais (DPO) da entidade, divulgado na política de privacidade (LGPD art. 41). |
| `lgpd_encarregado_email` | text | sim |  |  | identificação | Canal de contato do encarregado, divulgado na política de privacidade e usado pelos titulares para exercer direitos. |
| `lgpd_politica_atualizada_em` | date | sim |  |  |  | Data da última revisão da política de privacidade da entidade, mostrada no topo de /privacidade. |
| `nit_pis` | text | sim |  |  | identificação | NIT/PIS/PASEP do fornecedor pessoa física (autônomo pago por RPA), só os 11 dígitos — vai para o relatório de RPAs da contabilidade (eSocial/DCTFWeb). |
| `comprovante_automatico` | boolean | não | `false` |  |  | Fornecedor: o comprovante anexado à ordem paga é enviado automaticamente aos contatos que recebem comprovantes. |
| `filiacao_repasse_desde` | integer | sim |  |  | nenhum | Competência (AAAAMM) a partir da qual o controle de envio cobra atraso das fontes pagadoras e lista inclusões/exclusões de desconto a comunicar; null = controle ainda não ativado. |
| `filiacao_remessa_automatica` | boolean | não | `true` |  | nenhum | O controle de envio cria sozinho a remessa das competências dos tipos controlados (só com o controle ativado). |
| `filiacao_cobranca_automatica` | boolean | não | `false` |  | nenhum | Na entidade: a tarefa diária lembra o RH das fontes pagadoras antes do prazo da relação e cobra depois dele (15/11/2026). |
| `filiacao_lembrete_dias` | smallint | não | `3` |  | nenhum | Na entidade: dias antes do prazo da relação em que sai o lembrete automático; 0 = sem lembrete. |
| `repasse_cobranca_automatica` | boolean | não | `true` |  | nenhum | Na fonte pagadora: entra na cobrança automática da entidade (false = só cobrança manual). |

Únicas: `UNIQUE (bubble_id)`

Checks: `empresa_filiacao_lembrete_dias_check` `CHECK (((filiacao_lembrete_dias >= 0) AND (filiacao_lembrete_dias <= 15)))`; `empresa_filiacao_repasse_desde_check` `CHECK (((filiacao_repasse_desde IS NULL) OR (((filiacao_repasse_desde >= 200001) AND (filiacao_repasse_desde <= 210012)) AND (((filiacao_repasse_desde % 100) >= 1) AND ((filiacao_repasse_desde % 100) <= 12)))))`

Índices: `fornecedores_bubble_id_key`, `fornecedores_pkey`, `idx_bub_fornecedores`, `idx_empresa_entidade_apoiada`, `idx_empresa_mesclado_em`

## empresa_contatos

Pessoas de contato de fornecedores e empregadores (nome, cargo, telefone, e-mail), mantidas na ficha do fornecedor. A marca recebe_ordem_compra define quem recebe a ordem de compra por e-mail.

- **LGPD:** identificação, trabalhista · titulares: contatos de fornecedores e empregadores (público externo)
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `empresa_id` | uuid | sim |  | → empresa (**cascade**) |  |  |
| `nome` | text | não | `''::text` |  | identificação |  |
| `cargo` | text | sim |  |  | trabalhista |  |
| `telefone` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `principal` | boolean | não | `false` |  |  |  |
| `observacao` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `recebe_ordem_compra` | boolean | não | `false` |  |  |  |
| `recebe_comprovante` | boolean | não | `false` |  |  | O contato recebe por e-mail os comprovantes de pagamento das ordens do fornecedor (precisa de e-mail). |
| `contato_folha` | boolean | não | `false` |  | nenhum | Contato do RH/folha da empresa: recebe a cobrança da relação de descontos e as inclusões/exclusões de desconto. |

Índices: `empresa_contatos_pkey`, `idx_empresa_contatos_empresa`

## empresa_departamentos

Departamentos da entidade (secretarias, setores), com coordenador. Usados em compras, ofícios, agenda, contas e avisos. Departamento legado sai das listas mas fica nos registros antigos.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `departamento` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `coordenador_id` | uuid | sim |  | → usuarios |  |  |
| `organizacao_id` | uuid | sim |  | → empresa |  | Organização (empresa) a que o departamento pertence. |
| `slug` | text | sim |  |  |  |  |
| `legado` | boolean | não | `false` |  |  | Departamento desativado: fora das listas de escolha, mantido nos registros antigos (compras, ofícios, contas). |
| `legado_em` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `empresa_departamentos_bubble_id_key`, `empresa_departamentos_pkey`

## empresa_departamentos_integrantes

Usuários que integram cada departamento da entidade. Usado em avisos, permissões e diárias da diretoria.

- **LGPD:** trabalhista · titulares: funcionários, diretores
- **RLS:** ligado · policies: `tenant_isolation_pai`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `departamento_id` | uuid | não |  | → empresa_departamentos (**cascade**) |  |  |
| 🔑 `usuario_id` | uuid | não |  | → usuarios (**cascade**) | trabalhista | Lotação da pessoa no departamento. |
| `principal` | boolean | não | `false` |  | nenhum | Departamento principal da pessoa, quando ela está em mais de um: é por ele que conta o uso da IA (cota e relatório) e quem revisa o acesso dela. |

Índices: `empresa_departamentos_integrantes_pkey`

## empresa_sede

Sedes e subsedes da entidade com endereço e telefones. Usadas no rodapé dos ofícios, na agenda, em cobranças e na cessão de espaços.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `nome` | text | não |  |  |  |  |
| `emp_ref_id` | uuid | sim |  | → empresa |  | Organização a que a sede pertence. |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `cep` | text | sim |  |  |  |  |
| `logradouro` | text | sim |  |  |  |  |
| `numero` | text | sim |  |  |  |  |
| `complemento` | text | sim |  |  |  |  |
| `bairro` | text | sim |  |  |  |  |
| `cidade` | text | sim |  |  |  |  |
| `estado` | text | sim |  |  |  |  |
| `telefones` | text | sim |  |  |  | Telefones de contato da sede, texto livre (ex.: "(22) 2765-9550 / (22) 99742-3547"). Usado no rodapé dos ofícios. |

Únicas: `UNIQUE (bubble_id)`

Índices: `empresa_sede_bubble_id_key`, `empresa_sede_pkey`

## gestao_eventos

O que os administradores mudaram na Gestão (chave de IA cadastrada ou removida, teto, modelo, módulos desligados) e quem mudou. Só se acrescenta (19/11/2026).

- **LGPD:** identificação · titulares: funcionarios
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `criado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios (set null) | identificação | Quem fez a mudança. |
| `area` | text | não |  |  |  | Área da Gestão: ia, integracoes, acessos. |
| `acao` | text | não |  |  |  | O que foi feito, em poucas palavras (ex.: chave_cadastrada). |
| `detalhe` | text | sim |  |  | nenhum | Detalhe legível da mudança; nunca a chave nem dado pessoal além do nome. |

Índices: `gestao_eventos_emp_data_idx`, `gestao_eventos_pkey`

## ia_config

Configuração da IA da entidade (Gestão › Inteligência Artificial, 19/11/2026): chave de API própria cifrada pela aplicação, modelo, teto mensal, preços para estimar o custo e módulos com a IA desligada.

- **LGPD:** **credencial (nunca exportar)** · titulares: funcionarios
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `chave_cifrada` | text | sim |  |  | **credencial (nunca exportar)** | Chave de API da entidade cifrada com AES-256-GCM pela aplicação (lib/segredos.ts); a chave de cifra fica em variável de ambiente, fora do banco. Nunca é devolvida à tela. |
| `chave_versao` | smallint | sim |  |  |  | Qual chave de cifra foi usada (0 = derivada de SAUDE_RELATORIO_CHAVE, 1 = SEGREDOS_CHAVE), para permitir a rotação. |
| `chave_final` | text | sim |  |  | **credencial (nunca exportar)** | Os 4 últimos caracteres da chave, só para identificá-la na tela. |
| `chave_definida_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem cadastrou a chave atual. |
| `chave_definida_em` | timestamp with time zone | sim |  |  |  | Quando a chave atual foi cadastrada. |
| `chave_testada_em` | timestamp with time zone | sim |  |  |  | Último teste de conexão com a chave atual. |
| `chave_teste_erro` | text | sim |  |  | nenhum | Erro do último teste (nulo = deu certo). |
| `modelo` | text | sim |  |  |  | Modelo escolhido pela entidade; nulo = o padrão da plataforma (MODELO_IA). |
| `ia_ativa` | boolean | não | `true` |  |  | false = toda a IA desligada na entidade. |
| `modulos_desligados` | text[] | não | `'{}'::text[]` |  |  | Módulos (slug de lib/ia-processos.ts) em que a IA está desligada. |
| `limite_mensal_usd` | numeric(12,2) | sim |  |  |  | Teto de custo estimado por mês, em US$ (precisa dos preços). Nulo = sem teto. |
| `bloquear_no_limite` | boolean | não | `false` |  |  | true = ao atingir o teto, a IA para até o mês seguinte; false = só avisa. |
| `preco_entrada_usd_milhao` | numeric(12,4) | sim |  |  |  | Preço do modelo por 1 milhão de tokens de entrada, em US$ (para estimar o custo). |
| `preco_entrada_cache_usd_milhao` | numeric(12,4) | sim |  |  |  | Preço por 1 milhão de tokens de entrada lidos do cache, em US$. |
| `preco_saida_usd_milhao` | numeric(12,4) | sim |  |  |  | Preço por 1 milhão de tokens de saída (inclui o raciocínio), em US$. |
| `atualizado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem salvou a configuração por último. |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `aviso_teto_mes` | text | sim |  |  |  | Mês (AAAA-MM) do último aviso de teto da IA enviado aos administradores. |
| `aviso_teto_nivel` | smallint | sim |  |  |  | Nível já avisado no mês de aviso_teto_mes: 80 (perto do teto) ou 100 (atingido). |
| `chave_aviso_erro_em` | timestamp with time zone | sim |  |  |  | Quando os administradores foram avisados da última recusa da chave da entidade (no máximo um aviso por dia). |
| `modelos_processo` | jsonb | não | `'{}'::jsonb` |  | nenhum | Modelo de IA por processo: {"<chave do processo de lib/ia-processos.ts>": "<modelo>"}. Processo ausente usa o modelo geral. |
| `precos_modelos` | jsonb | não | `'{}'::jsonb` |  | nenhum | Preços por modelo, em US$ por 1 milhão de tokens: {"<modelo>": {"entrada": n, "cache": n, "saida": n}}, para estimar o custo das chamadas que usam modelos além do geral. |
| `cotas_departamento` | jsonb | não | `'{}'::jsonb` |  | nenhum | Cota mensal de IA por departamento: {"<departamento_id>": limite em US$}. Trava e avisa como o teto geral. |
| `cotacao_usd_brl` | numeric(10,4) | sim |  |  | nenhum | Cotação informada pela Gestão (R$ por US$ 1) para mostrar o custo da IA também em reais. Nulo = só dólar. |
| `minutos_humanos` | jsonb | não | `'{}'::jsonb` |  |  | Inventário da IA: minutos que uma pessoa levaria para fazer cada operação à mão (processo de lib/ia-processos.ts → minutos), ajustados pela Gestão; sem ajuste vale a estimativa do catálogo (26/11/2026). |

Checks: `ia_config_chave_final_curta` `CHECK (((chave_final IS NULL) OR (length(chave_final) <= 4)))`; `ia_config_limite_positivo` `CHECK (((limite_mensal_usd IS NULL) OR (limite_mensal_usd > (0)::numeric)))`

Índices: `ia_config_pkey`

## ia_cota_avisos

Avisos de cota de IA já enviados por departamento, mês (AAAA-MM) e nível (80 ou 100), para não repetir (20/11/2026).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| 🔑 `departamento_id` | uuid | não |  | → empresa_departamentos (**cascade**) |  |  |
| 🔑 `mes` | text | não |  |  |  |  |
| 🔑 `nivel` | smallint | não |  |  |  |  |
| `avisado_em` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `ia_cota_avisos_nivel_valido` `CHECK ((nivel = ANY (ARRAY[80, 100])))`

Índices: `ia_cota_avisos_pkey`

## ia_uso

Uma linha por chamada à IA (lib/ia.ts): quem pediu, processo, módulo, departamento, modelo, tokens, custo estimado e resultado. Não guarda o texto enviado nem o devolvido (19/11/2026).

- **LGPD:** identificação · titulares: funcionarios
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `criado_em` | timestamp with time zone | não | `now()` |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios (set null) | identificação | Quem estava logado quando a IA foi chamada; nulo em tarefa agendada, bot ou fluxo público. |
| `departamento_id` | uuid | sim |  | → empresa_departamentos (set null) |  | Departamento da pessoa no momento da chamada (o primeiro que coordena ou integra). |
| `processo` | text | não | `'nao_identificado'::text` |  |  | Identificador do processo que chamou a IA (catálogo em lib/ia-processos.ts), ex.: compras.descricao. |
| `modulo` | text | não | `'outros'::text` |  |  | Módulo do processo (slug do catálogo), ex.: compras, financeiro, pessoal. |
| `tipo` | text | não | `'texto'::text` |  |  | Entrada da chamada: texto, json (texto com resposta estruturada), pdf ou imagem. |
| `modelo` | text | não |  |  |  |  |
| `origem_chave` | text | não | `'plataforma'::text` |  |  | Qual chave pagou: entidade (chave própria), plataforma (OPENAI_API_KEY) ou bloqueada (não chamou: IA desligada ou teto atingido). |
| `tokens_entrada` | integer | não | `0` |  |  | Tokens de entrada (inclui os do cache). |
| `tokens_entrada_cache` | integer | não | `0` |  |  | Parte dos tokens de entrada lida do cache (mais barata). |
| `tokens_saida` | integer | não | `0` |  |  | Tokens de saída (inclui o raciocínio). |
| `tokens_raciocinio` | integer | não | `0` |  |  | Parte dos tokens de saída gasta no raciocínio interno do modelo. |
| `custo_estimado_usd` | numeric(12,6) | sim |  |  |  | Custo estimado em US$ pelos preços de ia_config no momento da chamada; nulo sem preços. |
| `duracao_ms` | integer | sim |  |  |  | Duração da chamada em milissegundos. |
| `sucesso` | boolean | não | `true` |  |  |  |
| `erro` | text | sim |  |  | nenhum | Mensagem de erro amigável quando a chamada falhou (nunca o conteúdo). |

Checks: `ia_uso_origem_valida` `CHECK ((origem_chave = ANY (ARRAY['entidade'::text, 'plataforma'::text, 'bloqueada'::text])))`; `ia_uso_tipo_valido` `CHECK ((tipo = ANY (ARRAY['texto'::text, 'json'::text, 'pdf'::text, 'imagem'::text])))`

Índices: `ia_uso_emp_data_idx`, `ia_uso_emp_usuario_idx`, `ia_uso_pkey`

## lgpd_bloqueios_litigio

Bloqueio por litígio (legal hold, item 4 da seção 4 de retencao.md): enquanto vigente, a pessoa (CPF ou e-mail) ou o registro (tabela + id) fica fora de todas as regras do motor de retenção. Encerrar é carimbar encerrado_em; a linha fica como histórico.

- **LGPD:** identificação · titulares: filiados, interessados, inscritos e demais pessoas envolvidas em processo
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `cpf` | text | sim |  |  | identificação | CPF bloqueado, só dígitos. |
| `email` | text | sim |  |  | identificação | E-mail bloqueado, em minúsculas. |
| `tabela` | text | sim |  |  |  | Tabela do registro bloqueado (com registro_id). |
| `registro_id` | uuid | sim |  |  |  | Id do registro bloqueado na tabela indicada. |
| `motivo` | text | não |  |  | identificação | Por que o descarte está suspenso. Pode citar a pessoa ou o caso. |
| `processo` | text | sim |  |  | identificação | Número do processo ou procedimento, quando houver. |
| `criado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem criou o bloqueio. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `encerrado_em` | timestamp with time zone | sim |  |  |  | Fim do bloqueio; nulo = vigente. |
| `encerrado_por` | uuid | sim |  | → usuarios (set null) | identificação | Quem encerrou o bloqueio. |

Checks: `lgpd_bloqueios_litigio_alvo_check` `CHECK (((cpf IS NOT NULL) OR (email IS NOT NULL) OR ((tabela IS NOT NULL) AND (registro_id IS NOT NULL))))`; `lgpd_bloqueios_litigio_cpf_check` `CHECK (((cpf IS NULL) OR (cpf ~ '^[0-9]{11}$'::text)))`; `lgpd_bloqueios_litigio_email_check` `CHECK (((email IS NULL) OR (email = lower(email))))`

Índices: `idx_lgpd_bloqueios_litigio_vigentes`, `lgpd_bloqueios_litigio_pkey`

## lgpd_exportacoes

Livro de exportações (achado M5 da RIPD da base multi-entidade): uma linha por arquivo com dado pessoal gerado no painel (planilha, PDF, CNAB), com quem, quando, rota, filtros e quantidade de linhas. Gravado só pelo service_role (src/lib/exportacoes.ts); a entidade lê em Institucional › Auditoria.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `usuario_id` | uuid | sim |  | → usuarios (set null) | identificação | Usuário do painel que gerou o arquivo. |
| `recurso` | text | não |  |  |  | O que foi exportado, com chave estável (filiados, filiados_relatorio, cat, links_voto…); rótulos em src/lib/exportacoes.ts. |
| `rota` | text | não |  |  |  | Caminho da rota que gerou o arquivo (sem a query string). |
| `formato` | text | sim |  |  |  | csv, xlsx, pdf ou cnab. |
| `filtros` | jsonb | não | `'{}'::jsonb` |  | identificação | Parâmetros da URL usados no recorte (busca, situação, fonte, período…). A busca livre pode conter um nome. |
| `quantidade` | integer | sim |  |  |  | Linhas (pessoas ou registros) no arquivo; nulo quando a rota não sabe contar. |
| `categorias` | text[] | não | `'{}'::text[]` |  |  | Categorias de dado pessoal presentes no arquivo (identificacao, cpf, sindical, saude, financeiro, trabalhista, voto). |
| `created_at` | timestamp with time zone | não | `now()` |  |  | Quando o arquivo foi gerado. |

Índices: `idx_lgpd_exportacoes_emp`, `idx_lgpd_exportacoes_usuario`, `lgpd_exportacoes_pkey`

## lgpd_regras_retencao

Regras do motor de retenção (seção 4 de docs/lgpd/retencao.md): uma linha por entidade e código RT, com prazo padrão, mínimo legal, prazo escolhido e ação. Desligada (ativa = false), o cron mensal só SIMULA; ligada, elimina ou anonimiza de fato. O comportamento de cada código está em src/lib/lgpd/retencao-motor.ts.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `codigo` | text | não |  |  |  | Código da tabela de prazos de retencao.md (RT01–RT35). |
| `tabela` | text | não |  |  |  | Tabela principal que a regra varre (documentação; a regra pode tocar tabelas filhas e o Storage). |
| `coluna_ancora` | text | não |  |  |  | Coluna com a data a partir da qual o prazo corre. |
| `prazo_padrao_dias` | integer | não |  |  |  | Prazo proposto em retencao.md, em dias. |
| `prazo_minimo_dias` | integer | não | `0` |  |  | Mínimo legal travado: a entidade não pode escolher prazo menor. |
| `prazo_dias` | integer | sim |  |  |  | Prazo escolhido pela entidade, em dias; nulo = padrão. A RT30 ignora este campo e usa eventos_config.retencao_foto_dias. |
| `acao` | text | não | `'eliminar'::text` |  |  | eliminar ou anonimizar. |
| `ativa` | boolean | não | `false` |  |  | Execução real ligada pela entidade. Desligada, o cron só simula e registra no livro o que sairia. |
| `ativada_em` | timestamp with time zone | sim |  |  |  | Quando a execução real foi ligada pela última vez. |
| `ativada_por` | uuid | sim |  | → usuarios (set null) | identificação | Usuário que ligou a execução real. |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, codigo)`

Checks: `lgpd_regras_retencao_acao_check` `CHECK ((acao = ANY (ARRAY['eliminar'::text, 'anonimizar'::text])))`; `lgpd_regras_retencao_codigo_check` `CHECK ((codigo ~ '^RT[0-9]{2}$'::text))`; `lgpd_regras_retencao_minimo_check` `CHECK (((prazo_minimo_dias >= 0) AND (prazo_padrao_dias >= prazo_minimo_dias)))`; `lgpd_regras_retencao_prazo_check` `CHECK (((prazo_dias IS NULL) OR (prazo_dias >= prazo_minimo_dias)))`

Índices: `lgpd_regras_retencao_pkey`, `lgpd_regras_retencao_unica`

## lgpd_retencao_execucoes

Livro do motor de retenção: uma linha por regra executada (simulação ou real), com prazo, data de corte, linhas afetadas, arquivos removidos do Storage e registros poupados por bloqueio de litígio. Só contagens e nomes de tabela, nenhum dado do titular.

- **LGPD:** identificação · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa (**cascade**) |  |  |
| `regra_id` | uuid | sim |  | → lgpd_regras_retencao (set null) |  |  |
| `codigo` | text | não |  |  |  | Código RT da regra (cópia, para o livro sobreviver à regra). |
| `modo` | text | não |  |  |  | simulacao (lista o que sairia, sem apagar) ou real. |
| `origem` | text | não | `'cron'::text` |  |  | cron (rodada mensal) ou painel (simulação pedida na tela). |
| `prazo_dias` | integer | não |  |  |  | Prazo efetivo usado na rodada. |
| `corte` | timestamp with time zone | não |  |  |  | Data de corte: registros com a âncora anterior a ela entram na regra. |
| `linhas_afetadas` | integer | não | `0` |  |  | Registros eliminados ou anonimizados (na simulação: os que seriam). |
| `arquivos_removidos` | integer | não | `0` |  |  | Arquivos apagados do Storage (na simulação: os que seriam). |
| `bloqueadas` | integer | não | `0` |  |  | Registros que cairiam na regra, mas foram poupados por bloqueio de litígio. |
| `detalhe` | jsonb | não | `'{}'::jsonb` |  |  | Contagem por tabela e observações (limite atingido, falhas de Storage). Sem dado pessoal. |
| `erro` | text | sim |  |  |  | Mensagem de erro, quando a rodada falhou. |
| `usuario_id` | uuid | sim |  | → usuarios (set null) | identificação | Quem pediu a simulação no painel; nulo no cron. |
| `iniciada_em` | timestamp with time zone | não | `now()` |  |  | Início da rodada. |
| `concluida_em` | timestamp with time zone | sim |  |  |  | Fim da rodada; nulo se ela não terminou. |

Checks: `lgpd_retencao_execucoes_modo_check` `CHECK ((modo = ANY (ARRAY['simulacao'::text, 'real'::text])))`; `lgpd_retencao_execucoes_origem_check` `CHECK ((origem = ANY (ARRAY['cron'::text, 'painel'::text])))`

Índices: `idx_lgpd_retencao_execucoes_regra`, `lgpd_retencao_execucoes_pkey`

## lgpd_solicitacoes

Livro de solicitações de titulares. NÃO armazenar aqui nome, CPF ou contato — o objetivo é provar o tratamento, não preservar o dado.

- **LGPD:** identificação, **sensível: sindical** · titulares: filiados, público externo
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `filiacao_id` | uuid | sim |  | → filiacoes | **sensível: sindical** |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `tipo` | text | não |  |  |  |  |
| `solicitado_em` | date | não |  |  |  |  |
| `concluido_em` | timestamp with time zone | sim |  |  |  |  |
| `executado_por_id` | uuid | sim |  | → usuarios |  |  |
| `registros_anonimizados` | text | sim |  |  |  | Resumo das tabelas/registros anonimizados no atendimento. |
| `registros_retidos` | text | sim |  |  |  | Resumo do que foi mantido e por quê. |
| `base_legal_retencao` | text | sim |  |  |  |  |
| `observacao` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `inscricao_id` | uuid | sim |  | → eventos_inscricoes |  |  |
| `email_titular` | text | sim |  |  | identificação | Contradiz o comentário da tabela, que pede não guardar contato do titular. |
| `cpf_titular` | text | sim |  |  | identificação | Contradiz o comentário da tabela, que pede não guardar CPF. |
| `acesso_remocao_pendente` | boolean | não | `false` |  |  | Falta remover o login (conta Auth) do titular. |
| `acesso_removido_em` | timestamp with time zone | sim |  |  |  |  |
| `acesso_removido_por` | uuid | sim |  | → usuarios |  |  |

Índices: `idx_lgpd_solic_email`, `lgpd_solicitacoes_filiacao_idx`, `lgpd_solicitacoes_pkey`

## login_tentativas

Contador de falhas de login e de envio de código por chave (lib/login-bloqueio.ts e portal/votacao), com bloqueio temporário após 5 ou 10 falhas.

- **LGPD:** identificação · titulares: usuários do sistema, filiados, eleitores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  | → empresa |  |  |
| `chave` | text | não |  |  | identificação | Tipo + identificador da tentativa (e-mail, CPF ou endereço). |
| `falhas` | integer | não | `0` |  |  |  |
| `ultima_falha_em` | timestamp with time zone | sim |  |  |  |  |
| `bloqueado_ate` | timestamp with time zone | sim |  |  |  |  |

Únicas: `UNIQUE (emp_proprietaria_id, chave)`

Índices: `login_tentativas_emp_proprietaria_id_chave_key`, `login_tentativas_pkey`

## perfil_permissoes

Chave de permissão concedida a um perfil de acesso (RBAC por cima da ACL plana).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `perfil_id` | uuid | não |  | → perfis (**cascade**) |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `chave` | text | não |  |  |  | Nome da permissão (mesmo nome das colunas booleanas de permissoes). |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (perfil_id, chave)`

Índices: `idx_perfil_permissoes_emp`, `idx_perfil_permissoes_perfil`, `perfil_permissoes_perfil_id_chave_key`, `perfil_permissoes_pkey`

## perfis

Perfil de acesso do tenant (ex.: Recepção, Financeiro), agrupando permissões e alçada de aprovação.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | não |  |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `alcada_aprovacao` | numeric | sim |  |  |  | Valor máximo que o perfil pode aprovar. |
| `concede_tudo` | boolean | não | `false` |  |  | Perfil de administrador: concede todas as permissões. |
| `sistema` | boolean | não | `false` |  |  | Perfil criado pelo sistema, não editável. |
| `ativo` | boolean | não | `true` |  |  |  |
| `ordem` | integer | não | `0` |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |
| `padrao_onboarding` | boolean | não | `false` |  |  | Perfil dado automaticamente a usuários novos. |

Índices: `idx_perfis_emp`, `perfis_pkey`, `uq_perfis_emp_nome`, `uq_perfis_padrao_por_tenant`

## permissoes

ACL plana por usuário: uma coluna booleana por área/ação do sistema, mais alçada de aprovação. Migrada do Bubble; editada em Configurações > Permissões.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `usuario_id` | uuid | sim |  | → usuarios |  |  |
| `usuario_raw` | text | sim |  |  |  | bubble_id do usuário no Bubble. |
| `alcada_aprovacao` | numeric(15,2) | sim | `0` |  |  | Valor máximo que o usuário pode aprovar. |
| `compras_por_depto_raw` | text[] | sim |  |  |  | Departamentos cujas compras o usuário vê (Bubble, normalizado em permissoes_compras_depto). |
| `aquisicoes_avaliacoes` | boolean | sim | `false` |  |  |  |
| `aquisicoes_compras` | boolean | sim | `false` |  |  |  |
| `aquisicoes_compras_edicao` | boolean | sim | `false` |  |  |  |
| `aquisicoes_contratos` | boolean | sim | `false` |  |  |  |
| `aquisicoes_contratos_edicao` | boolean | sim | `false` |  |  |  |
| `aquisicoes_fornecedores` | boolean | sim | `false` |  |  |  |
| `aquisicoes_recebimentos` | boolean | sim | `false` |  |  |  |
| `assembleias` | boolean | sim | `false` |  |  |  |
| `configuracoes` | boolean | sim | `false` |  |  |  |
| `diretoria_mandatos` | boolean | sim | `false` |  |  |  |
| `diretoria_passagens` | boolean | sim | `false` |  |  |  |
| `diretoria_reunioes` | boolean | sim | `false` |  | nenhum | Atas de reunião: criar, editar e excluir (inclui consultar). |
| `ferramentas_agendas` | boolean | sim | `false` |  |  |  |
| `ferramentas_anomalias` | boolean | sim | `false` |  |  |  |
| `ferramentas_busca_pessoas` | boolean | sim | `false` |  |  |  |
| `ferramentas_ci` | boolean | sim | `false` |  |  |  |
| `ferramentas_demandas` | boolean | sim | `false` |  |  |  |
| `ferramentas_documentos` | boolean | sim | `false` |  |  |  |
| `ferramentas_emails_internos` | boolean | sim | `false` |  |  |  |
| `ferramentas_linhas_telefone` | boolean | sim | `false` |  |  |  |
| `ferramentas_oficios` | boolean | sim | `false` |  |  |  |
| `ferramentas_projetos` | boolean | sim | `false` |  |  |  |
| `ferramentas_projetos_edicao` | boolean | sim | `false` |  |  |  |
| `ferramentas_tarefas` | boolean | sim | `false` |  |  |  |
| `filiacao_consulta_convenios` | boolean | sim | `false` |  |  |  |
| `filiacao_convenios` | boolean | sim | `false` |  |  |  |
| `filiacao_empresas` | boolean | sim | `false` |  |  |  |
| `filiacao_filiados` | boolean | sim | `false` |  |  |  |
| `filiacao_gestao` | boolean | sim | `false` |  |  |  |
| `filiacao_hospedagens` | boolean | sim | `false` |  |  |  |
| `filiacao_hospedagens_edicao` | boolean | sim | `false` |  |  |  |
| `filiacao_hospedagens_gestao` | boolean | sim | `false` |  |  |  |
| `filiacao_receitas` | boolean | sim | `false` |  |  |  |
| `filiacao_reembolsos` | boolean | sim | `false` |  |  |  |
| `financeiro_apoio` | boolean | sim | `false` |  |  |  |
| `financeiro_caixa` | boolean | sim | `false` |  |  |  |
| `financeiro_caixa_admin` | boolean | sim | `false` |  |  |  |
| `financeiro_centro_custo` | boolean | sim | `false` |  |  |  |
| `financeiro_pagamento` | boolean | sim | `false` |  |  |  |
| `financeiro_receitas_sindicais` | boolean | sim | `false` |  |  |  |
| `financeiro_tributos` | boolean | sim | `false` |  |  |  |
| `juridico_geral` | boolean | sim | `false` |  |  |  |
| `juridico_gestao` | boolean | sim | `false` |  |  |  |
| `juridico_homologacoes` | boolean | sim | `false` |  |  |  |
| `patrimonio_geral` | boolean | sim | `false` |  |  |  |
| `permissoes` | boolean | sim | `false` |  |  |  |
| `pessoal_anuenios` | boolean | sim | `false` |  |  |  |
| `pessoal_aso` | boolean | sim | `false` |  |  |  |
| `pessoal_contracheque` | boolean | sim | `false` |  |  |  |
| `pessoal_diarias` | boolean | sim | `false` |  |  |  |
| `pessoal_faltas_justificadas` | boolean | sim | `false` |  |  |  |
| `pessoal_informes_rendimentos` | boolean | sim | `false` |  |  |  |
| `pessoal_niveis_salariais` | boolean | sim | `false` |  |  |  |
| `pessoal_registro_ponto` | boolean | sim | `false` |  |  |  |
| `pessoal_gestao` | boolean | sim | `false` |  |  |  |
| `saude_atendimento` | boolean | sim | `false` |  |  |  |
| `saude_cat` | boolean | sim | `false` |  |  |  |
| `saude_gestao` | boolean | sim | `false` |  |  |  |
| `veiculos` | boolean | sim | `false` |  |  |  |
| `veiculos_condutores` | boolean | sim | `false` |  |  |  |
| `veiculos_contratos` | boolean | sim | `false` |  |  |  |
| `veiculos_infracoes` | boolean | sim | `false` |  |  |  |
| `veiculos_gestao` | boolean | sim | `false` |  |  |  |
| `emp_proprietaria_id` | uuid | sim | `'c763cb99-edfd-4840-8453-ed3fcb66d4a1'::uuid` |  |  |  |
| `created_at` | timestamp with time zone | sim |  |  |  |  |
| `modified_at` | timestamp with time zone | sim |  |  |  |  |
| `noticias` | boolean | não | `false` |  |  |  |
| `oposicao` | boolean | não | `false` |  |  |  |
| `acordos_coletivos` | boolean | não | `false` |  |  |  |
| `empregadores` | boolean | não | `false` |  |  |  |
| `registro_mte` | boolean | não | `false` |  |  |  |
| `apoio_institucional` | boolean | sim | `false` |  |  |  |
| `apoio_institucional_edicao` | boolean | sim | `false` |  |  |  |
| `custeio_institucional` | boolean | sim | `false` |  |  |  |
| `custeio_institucional_edicao` | boolean | sim | `false` |  |  |  |
| `custeio_institucional_autorizacao` | boolean | sim | `false` |  |  |  |
| `financeiro_leitura` | boolean | sim | `false` |  |  |  |
| `patrimonio_leitura` | boolean | sim | `false` |  |  |  |
| `aquisicoes_comprador` | boolean | não | `false` |  |  |  |
| `veiculos_checklist` | boolean | sim |  |  |  |  |
| `veiculos_manutencao` | boolean | sim |  |  |  |  |
| `eventos` | boolean | sim |  |  |  |  |
| `eventos_gestao` | boolean | sim |  |  |  |  |
| `eventos_recepcao` | boolean | sim |  |  |  |  |
| `veiculos_recepcao` | boolean | sim |  |  |  |  |
| `comunicacao_etiquetas` | boolean | sim |  |  |  |  |
| `aquisicoes_compra_direta` | boolean | sim |  |  |  |  |
| `ferramentas_oficios_todos` | boolean | sim |  |  |  |  |
| `diretoria_diarias` | boolean | sim |  |  |  | Ver e avaliar as diárias da diretoria (Institucional → Diretoria → Diárias). |
| `espacos` | boolean | sim |  |  |  |  |
| `espacos_gestao` | boolean | sim |  |  |  |  |
| `espacos_autorizacao` | boolean | sim |  |  |  |  |
| `viagens_gestao` | boolean | sim |  |  |  | Atender as solicitações de passagem e hospedagem, lançar em nome de outra pessoa e faturar. |
| `negociacoes` | boolean | sim |  |  |  |  |
| `financeiro_auditoria` | boolean | sim |  |  |  | Configurar as regras de verificação das ordens de pagamento (Financeiro → Auditoria das ordens). |
| `financeiro_estorno` | boolean | sim |  |  |  | Registrar estorno de pagamento de ordens pagas e configurar o prazo (Financeiro → Estornos). |
| `comunicacao_mensagens` | boolean | sim |  |  |  |  |
| `ferramentas_agendas_edicao` | boolean | sim | `false` |  |  |  |
| `institucional_auditoria` | boolean | sim |  |  |  |  |
| `filiacao_lgpd` | boolean | sim |  |  |  |  |
| `aquisicoes_fornecedores_edicao` | boolean | sim |  |  |  | Cadastrar, editar, inativar, excluir e mesclar fornecedores (Aquisição › Fornecedores). |
| `aquisicoes_contratos_autorizacao` | boolean | sim |  |  |  | Autorizar contratos (as parcelas recorrentes nascem autorizadas) e os pagamentos extraordinários de contrato. |
| `pessoal_contabilidade` | boolean | sim |  |  |  | Contabilidade: consultar, exportar e dar recebimento nas competências enviadas do movimento da folha. |
| `pessoal_contabilidade_envio` | boolean | sim |  |  |  | Conferir e enviar à contabilidade o movimento da folha de cada competência. |
| `pessoal_reembolsos` | boolean | sim |  |  |  | Reembolsos do ACT: avaliar os pedidos, tipos do ACT e o histórico por funcionário (sem a Gestão de Pessoal inteira). |
| `oposicao_configurar` | boolean | sim | `false` |  | nenhum | Oposição com segregação: criar e editar campanhas, questionário, decisões jurídicas e relação ao empregador. |
| `oposicao_avaliar` | boolean | sim | `false` |  | nenhum | Oposição com segregação: avaliar (uma a uma e em lote), encerrar sem carta e reverificar assinatura. |
| `diretoria_atas_consulta` | boolean | sim | `false` |  | nenhum | Atas de reunião: só consultar (lista, ata e PDF), sem criar, editar ou excluir — isso é diretoria_reunioes. |
| `deliberacoes_livre` | boolean | sim | `false` |  | nenhum | Deliberações das atas: consulta as de sigilo livre. Cumulativa com reservado/restrito — vale a mais alta. |
| `deliberacoes_reservado` | boolean | sim | `false` |  | nenhum | Deliberações das atas: consulta as livres e as reservadas. |
| `deliberacoes_restrito` | boolean | sim | `false` |  | nenhum | Deliberações das atas: consulta todas (livres, reservadas e restritas). |
| `viagens_solicitar` | boolean | sim | `false` |  | nenhum | Viagens: solicita passagem e hospedagem para si (exige ser funcionário com vínculo em vigor ou diretor em exercício). |
| `viagens_solicitar_terceiros` | boolean | sim | `false` |  | nenhum | Viagens: solicita passagem e hospedagem para outro diretor, funcionário ou convidado. |
| `congressos` | boolean | sim | `false` |  | nenhum | Congressos e conferências: consultar congressos, configuração e participantes. |
| `congressos_gestao` | boolean | sim | `false` |  | nenhum | Congressos e conferências: criar, configurar e gerir participantes, delegações e programa. |
| `congressos_credenciamento` | boolean | sim | `false` |  | nenhum | Congressos e conferências: operar a mesa de credenciamento, a porta das sessões e o painel de quórum. |
| `congressos_relatoria` | boolean | sim | `false` |  | nenhum | Congressos e conferências: relatoria dos grupos, consolidação das propostas e mesa da plenária. |
| `gestao_sistema` | boolean | sim | `false` |  | nenhum | Gestão do sistema: inteligência artificial (chave, teto, módulos), integrações (API, webhooks, catracas) e a revisão de acessos. |

Únicas: `UNIQUE (bubble_id)`

Índices: `permissoes_bubble_id_key`, `permissoes_pkey`, `permissoes_usuario_id_idx`

## permissoes_compras_depto

Junção N:N: departamentos cujas compras o usuário da permissão pode ver (lib/db/departamentos.ts).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `permissao_id` | uuid | não |  | → permissoes (**cascade**) |  |  |
| 🔑 `departamento_id` | uuid | não |  | → empresa_departamentos (**cascade**) |  |  |

Índices: `permissoes_compras_depto_pkey`

## plataforma_admins

Operadores da plataforma (super-admin). Acessam /admin independentemente do tenant; NÃO são governados pelas permissões de tenant.

- **LGPD:** identificação · titulares: usuários do sistema (operadores da plataforma)
- **RLS:** ligado · policies: **nenhuma**
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `auth_user_id` | uuid | não |  |  |  |  |
| `nome` | text | sim |  |  | identificação |  |
| `email` | text | sim |  |  | identificação |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (auth_user_id)`

Índices: `plataforma_admins_auth_user_id_key`, `plataforma_admins_pkey`

## tenants

Organizações servidas pela plataforma. empresa_id é o registro cujo id vira emp_proprietaria_id nos dados do tenant. slug = subdomínio de acesso.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `empresa_id` | uuid | não |  | → empresa |  |  |
| `slug` | text | não |  |  |  |  |
| `dominio_custom` | text | sim |  |  |  |  |
| `status` | text | não | `'ativo'::text` |  |  |  |
| `plano` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (dominio_custom)`; `UNIQUE (slug)`

Índices: `tenants_dominio_custom_key`, `tenants_empresa_idx`, `tenants_pkey`, `tenants_slug_key`

## usuario_perfis

Atribuição de perfis de acesso (RBAC) a usuários do sistema.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `usuario_id` | uuid | não |  | → usuarios (**cascade**) |  |  |
| `perfil_id` | uuid | não |  | → perfis (**cascade**) |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Únicas: `UNIQUE (usuario_id, perfil_id)`

Índices: `idx_usuario_perfis_emp`, `idx_usuario_perfis_usuario`, `usuario_perfis_pkey`, `usuario_perfis_usuario_id_perfil_id_key`

## usuarios

Pessoas do sistema: funcionários, diretores, filiados com login, condutores e contas de função. Dados de identificação, vínculo, preferências de aviso e integração com Telegram. Migrado do Bubble.

- **LGPD:** identificação, **sensível: sindical**, trabalhista, **credencial (nunca exportar)** · titulares: usuários do sistema, funcionários, diretores, filiados, condutores
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`, `trg_usuarios_updated_at` → `set_updated_at`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  | ID original do Bubble. Nunca alterado após a primeira gravação. |
| `auth_user_id` | uuid | sim |  |  |  | Referência ao auth.users do Supabase. Preenchido após migração de autenticação. |
| `nome_completo` | text | sim |  |  | identificação |  |
| `nome_guerra` | text | sim |  |  | identificação | Apelido ou nome pelo qual a pessoa é conhecida. |
| `cpf` | text | sim |  |  | identificação |  |
| `cpf_arquivo` | text | sim |  |  | identificação | Imagem/arquivo do documento de CPF. |
| `foto` | text | sim |  |  | identificação |  |
| `data_nascimento` | date | sim |  |  | identificação |  |
| `nascimento_dia` | integer | sim |  |  | identificação |  |
| `nascimento_mes` | integer | sim |  |  | identificação |  |
| `sexo` | sexo_enum | sim |  |  | identificação |  |
| `estado_civil` | text | sim |  |  | identificação |  |
| `escolaridade` | text | sim |  |  | identificação |  |
| `whatsapp` | text | sim |  |  | identificação |  |
| `email_empresa` | text | sim |  |  | identificação |  |
| `empresa_matricula` | text | sim |  |  | trabalhista |  |
| `vinculo_instituicao` | text | sim |  |  | trabalhista | Relação com a entidade (funcionário, diretor, filiado...). |
| `filiado` | boolean | sim | `false` |  | **sensível: sindical** |  |
| `inativo` | boolean | sim | `false` |  |  |  |
| `deletado` | boolean | sim | `false` |  |  |  |
| `autoriza_notificacoes` | boolean | sim | `true` |  |  |  |
| `cnh_autorizado` | boolean | sim | `false` |  |  | Autorizado a conduzir veículos da entidade. |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | sim | `now()` |  |  |  |
| `slug` | text | sim |  |  |  |  |
| `email` | text | sim |  |  | identificação |  |
| `sindicato_id` | uuid | sim |  | → empresa |  |  |
| `vinculo_instituicao_os` | text | sim |  |  | trabalhista |  |
| `nascimento_data` | date | sim |  |  | identificação |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `anonimizado_em` | timestamp with time zone | sim |  |  |  | Data em que os dados pessoais foram anonimizados (LGPD). |
| `telegram_chat_id` | text | sim |  |  | identificação |  |
| `telegram_vinculo_codigo` | text | sim |  |  | **credencial (nunca exportar)** | Código temporário para vincular a conta ao bot do Telegram. |
| `telegram_vinculo_expira` | timestamp with time zone | sim |  |  |  |  |
| `telegram_notif_prefs` | jsonb | sim |  |  |  | Preferências de push do Telegram (opt-out). Chaves: contracheque/ponto/ferias/diarias → boolean. Ausência = ligado. |
| `telegram_telefone` | text | sim |  |  | identificação | Telefone confirmado via Telegram (só dígitos). Ativa o bot para o usuário. |
| `telegram_tel_pendente` | text | sim |  |  | identificação |  |
| `telegram_tel_codigo` | text | sim |  |  | **credencial (nunca exportar)** | Código de confirmação do telefone via Telegram. |
| `telegram_tel_expira` | timestamp with time zone | sim |  |  |  |  |
| `conta_funcao` | boolean | não | `false` |  |  | Conta do posto (ex.: Recepção), usada por quem o ocupa. Os ocupantes ficam em usuarios_ocupacoes. |
| `unificado_em_id` | uuid | sim |  | → usuarios |  | Conta que incorporou esta (mesma pessoa com dois usuários). Esta fica inativa e excluída; o que apontava para ela foi movido. |
| `unificado_em` | timestamp with time zone | sim |  |  |  |  |
| `notif_email_prefs` | jsonb | sim |  |  |  | Preferências de aviso por e-mail por evento (opt-in: chave=true liga). Ver lib/telegram-eventos.ts. |
| `push_notif_prefs` | jsonb | sim |  |  |  | Preferências de aviso no celular (Web Push) por evento (opt-in: chave=true liga). Ver lib/telegram-eventos.ts. |

Únicas: `UNIQUE (auth_user_id)`; `UNIQUE (bubble_id)`

Índices: `idx_bub_usuarios`, `idx_usuarios_auth_user`, `idx_usuarios_cpf`, `usuarios_auth_user_id_key`, `usuarios_auth_user_id_unico`, `usuarios_bubble_id_key`, `usuarios_pkey`, `usuarios_telegram_chat_id_idx`, `usuarios_telegram_vinculo_codigo_idx`

## usuarios_ocupacoes

Quem ocupou cada conta de função (ex.: Recepção) e em que período, com motivo e observação.

- **LGPD:** trabalhista · titulares: funcionários
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `conta_id` | uuid | não |  | → usuarios (**cascade**) |  | Conta de função (usuarios.conta_funcao). |
| `pessoa_id` | uuid | não |  | → usuarios | trabalhista | Pessoa que ocupou o posto. |
| `inicio` | date | não |  |  |  |  |
| `fim` | date | sim |  |  |  |  |
| `motivo` | text | não |  |  | trabalhista |  |
| `observacao` | text | sim |  |  | trabalhista |  |
| `registrado_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `usuarios_ocupacoes_motivo_check` `CHECK ((motivo = ANY (ARRAY['titular'::text, 'ferias'::text, 'afastamento'::text, 'substituicao'::text])))`; `usuarios_ocupacoes_periodo_check` `CHECK (((fim IS NULL) OR (fim >= inicio)))`; `usuarios_ocupacoes_pessoa_check` `CHECK ((pessoa_id <> conta_id))`

Índices: `idx_usuarios_ocupacoes_conta`, `idx_usuarios_ocupacoes_pessoa`, `usuarios_ocupacoes_pkey`

## usuarios_unificacoes

Registro de cada unificação de duas contas de usuário da mesma pessoa pela função unificar_usuarios: estado anterior das duas contas, o que foi movido e o que ficou pendente.

- **LGPD:** identificação, **sensível: sindical** · titulares: usuários do sistema
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `principal_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `secundario_usuario_id` | uuid | sim |  | → usuarios |  |  |
| `principal_antes` | jsonb | sim |  |  | **sensível: sindical** | Cópia da linha de usuarios do principal antes da unificação (CPF, nascimento, foto, filiado...). |
| `secundario_antes` | jsonb | sim |  |  | **sensível: sindical** | Cópia da linha de usuarios do secundário antes da unificação. |
| `movidos` | jsonb | sim |  |  |  | Mapa tabela.coluna para ids movidos. |
| `pendentes` | jsonb | sim |  |  |  | Tabelas que não puderam ser movidas e o erro. |
| `contatos_removidos` | jsonb | sim |  |  | identificação | E-mails, telefones e endereços duplicados removidos. |
| `feito_por_id` | uuid | sim |  | → usuarios |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `usuarios_unificacoes_pkey`

## webhooks

Webhooks cadastrados pela entidade para receber eventos (ordem autorizada ou paga, filiação aprovada, cobrança paga, retorno bancário), assinados com HMAC do segredo.

- **LGPD:** **credencial (nunca exportar)**
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `auditoria_registrar` → `registrar_auditoria`, `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `url` | text | não |  |  |  |  |
| `segredo` | text | não |  |  | **credencial (nunca exportar)** | Segredo HMAC em texto claro usado para assinar as entregas. |
| `eventos` | text[] | não | `'{}'::text[]` |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `ativo` | boolean | não | `true` |  |  |  |
| `falhas_seguidas` | integer | não | `0` |  |  | Falhas consecutivas de entrega; muitas desativam o webhook. |
| `ultimo_sucesso_em` | timestamp with time zone | sim |  |  |  |  |
| `ultimo_erro` | text | sim |  |  |  |  |
| `criado_por` | uuid | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `webhooks_emp_idx`, `webhooks_pkey`

## webhooks_entregas

Fila e histórico de entregas de cada evento a cada webhook, com corpo enviado, tentativas e último status HTTP.

- **LGPD:** **sensível: sindical**, financeiro, identificação · titulares: filiados, fornecedores PF, beneficiários de ordens
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | não |  |  |  |  |
| `webhook_id` | uuid | não |  | → webhooks (**cascade**) |  |  |
| `evento` | text | não |  |  |  |  |
| `payload` | jsonb | não |  |  | **sensível: sindical** | Corpo enviado; no evento filiacao.aprovada traz dados do novo filiado, nos de ordem e cobrança traz beneficiário e valores. |
| `situacao` | text | não | `'pendente'::text` |  |  |  |
| `tentativas` | integer | não | `0` |  |  |  |
| `proxima_tentativa_em` | timestamp with time zone | não | `now()` |  |  |  |
| `ultimo_status` | integer | sim |  |  |  |  |
| `ultimo_erro` | text | sim |  |  |  |  |
| `entregue_em` | timestamp with time zone | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Checks: `webhooks_entregas_situacao_check` `CHECK ((situacao = ANY (ARRAY['pendente'::text, 'entregue'::text, 'falhou'::text])))`

Índices: `webhooks_entregas_fila_idx`, `webhooks_entregas_pkey`, `webhooks_entregas_webhook_idx`
