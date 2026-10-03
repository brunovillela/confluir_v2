# Avaliação geral do Confluir 2.0 — 03/10/2026

Avaliação feita a partir do código (408 páginas, ~286 mil linhas de TypeScript, 181 arquivos de server actions, 180 tabelas) em três eixos: **segurança**, **qualidade de uso e automação** (funcionários, diretores e filiados) e **informação para decisão**. Cada ponto traz o que existe hoje, o que falta e o benefício esperado. Caminhos são relativos a `confluir/src`, salvo indicação.

Convenção de esforço: **P** = até 1 dia, **M** = 2–5 dias, **G** = mais de uma semana.

---

## 1. Segurança

### 1.1 Críticos — corrigir antes de qualquer coisa

| # | Problema | Evidência | Correção | Esforço |
|---|---|---|---|---|
| S1 | **A identidade do filiado vem de `user_metadata.cpf`, que o próprio usuário pode trocar.** O Supabase permite a qualquer sessão autenticada chamar `auth.updateUser({ data: { cpf } })` com a anon key pública. Conseguir uma sessão é fácil: o autocadastro da oposição cria conta por OTP para qualquer e-mail. Resultado: um atacante assume o portal de qualquer filiado ativo e **vota em nome dele**. | `lib/auth.ts:131, 172, 279`; `app/votar/[id]/actions.ts:291`; `app/portal/oposicao/actions.ts:96-122` | Mover a identidade para `app_metadata` (só o servidor grava) ou para uma tabela `auth_user_id ↔ filiacao` e nunca mais ler `user_metadata` para decidir quem é a pessoa. | M |
| S2 | **Metadata de conta existente é sobrescrito antes do OTP ser confirmado.** Qualquer pessoa, sem login, informa o e-mail de um funcionário ou filiado e um CPF não ativo; o sistema grava `{tipo:"nao_filiado", cpf}` por cima. Derruba o acesso da vítima e altera identidade. | `lib/codigo-acesso.ts:54-58`; `oposicao/actions.ts:114-119, 151-157` | Só gravar metadata depois do código confirmado, e nunca sobrescrever conta já vinculada a `usuarios` ou `filiacoes`. `listUsers` com `perPage:1000` também precisa virar busca por e-mail. | P |
| S3 | **Vazamento de nome completo e e-mail sem login.** A action pública de pedido de espaço devolve nome e e-mail de qualquer CPF de filiado ativo, sem limite de tentativas. | `app/espaco/[slug]/actions.ts:30-36`; `lib/db/espacos-solicitacao.ts:649-667` | Devolver só "encontrado" e exigir que a pessoa digite nome/e-mail (ou mascarar). Acrescentar rate limit (ver S6). | P |
| S4 | **Sigilo do voto e voto duplo.** O mesmo timestamp é gravado no voto anônimo e na participação do eleitor, o que permite cruzar os dois (contradiz o comentário em `voto-comprovante.ts:17-21`). E a checagem "já votou" + insert + update não é atômica: dois envios simultâneos contam dois votos. | `lib/db/votacao-portal.ts:567-583`, `~988`; `lib/db/votacao-mesarios.ts:1353-1364` | Arredondar o horário do voto (minuto) ou gravar `created_at` default do banco; marcar a participação **antes** do insert com `update … is(hora_voto,null)` e abortar se 0 linhas; UNIQUE em (apto, assembleia). | P |

### 1.2 Altos e médios

| # | Problema | Evidência | Correção | Esforço |
|---|---|---|---|---|
| S5 | **Sem cabeçalhos de segurança** (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy). | `next.config.ts`, `vercel.json` | Bloco `headers()` no `next.config.ts`. Começar por HSTS, frame-ancestors e nosniff; CSP em modo report-only. | P |
| S6 | **Sem rate limiting nem captcha** em nenhum ponto público (login, primeiro acesso, OTPs, /filiar, /espaco, /votar, descadastro). Pedir novo código zera o contador de tentativas. | `lib/db/filiacao-publica.ts:305`; ausência geral | Rate limit por IP+rota na Vercel (WAF ou Upstash) e Turnstile nos formulários públicos. | M |
| S7 | **Sem 2FA**, inclusive para super-admin (/admin) e para quem aprova pagamentos. Política de senha só exige 8 caracteres. | `app/acesso/senha/actions.ts:36`; nenhum uso de `mfa` | Supabase MFA (TOTP) obrigatório para /admin, financeiro_pagamento e alçada; ligar "leaked password protection" no dashboard. | M |
| S8 | **Open redirect** em `auth/confirm`: `next=//evil.com` passa pelo `startsWith("/")`. | `app/auth/confirm/route.ts:31` | Rejeitar `//` e `\\` (como já faz `acesso/senha/actions.ts:71`). | P |
| S9 | **Sem trilha de auditoria genérica.** Alterações em permissões, perfis, dados bancários de fornecedor, filiação e usuários não ficam registradas. Só há trilhas em ordens, ofícios, oposição, urnas, cessão, negociação. | `lib/db/perfis.ts`; `supabase/*-eventos` | Tabela `auditoria` com trigger genérico (tabela, pk, antes/depois, quem, quando) nas 20 tabelas mais sensíveis; tela "Quem alterou". | M |
| S10 | **Service role puro em 26 libs de tenant**, contra a regra do próprio `admin.ts`. O isolamento multi-tenant nesses pontos depende só de `.eq("emp_proprietaria_id")`. | `lib/db/eventos-titular.ts`, `filiacao-publica.ts`, `ferias.ts`, `faltas.ts`, `hospedagem-*.ts`, `telegram.ts`… | Trocar por `createAdminClient` (JWT de tenant) e deixar `createServiceClient` só na plataforma; lint que falha o build se aparecer fora de `lib/plataforma`. | M |
| S11 | **Uploads validam só o MIME declarado pelo cliente**, sem magic bytes, em 46 pontos espalhados; `contentType` gravado do cliente. 7 buckets não têm definição no repositório. | 46 chamadas `.upload(` | Função única `receberArquivo()` com allowlist, magic bytes e limite; declarar todos os buckets em SQL. | M |
| S12 | **Token de descadastro carrega o CPF legível** (base64url) na URL e no header List-Unsubscribe. Mesma chave `SUPABASE_JWT_SECRET` usada para JWT de tenant, link de voto e descadastro. | `lib/db/comunicacao-descadastro.ts:35-50` | Token opaco (uuid gravado) e chaves separadas por finalidade. | P |
| S13 | **Códigos OTP vão para o log** quando o e-mail falha. | `app/filiar/actions.ts:123,143`; `evento/[slug]/actions.ts:118`; `inscricao/[token]/actions.ts:91`; `meus-dados/actions.ts:47` | Logar só o erro, nunca o código. | P |
| S14 | **Enumeração de contas**: "Esta conta já foi ativada", "Seu cadastro não possui email", "Já há voto registrado para este CPF". | `login/actions.ts:114-118`; `portal/actions.ts:27-30`; `votacao-primeiro-acesso.ts:309` | Respostas genéricas. | P |
| S15 | **`ilike` sem escapar `%`/`_`** no casamento de identidade por e-mail. | `login/actions.ts:98`; `lib/db/hospedagem.ts:498`; `lib/auth.ts:~272` | Usar `eq` com lower() ou escapar. | P |
| S16 | **LGPD incompleta**: anonimização de filiado só existe como marca (nenhuma rotina apaga), portabilidade é só rótulo, consentimento do portal sem versão do termo nem IP. Cifra cobre só o relatório clínico; CAT, ASO, atestados ficam em claro; sem rotação de chave. | `supabase/lgpd-anonimizacao.sql`; `portal/lgpd/actions.ts:14-35`; `lib/saude-sigilo.ts:37` | Rotina de anonimização executável, exportação dos próprios dados no portal, consentimento versionado com IP, plano de rotação. | M |
| S17 | **Senha fixa de demonstração** versionada (`ConselhoFiscal123`). | `scripts/setup-fiscal-demo.mjs:15` | Ler de env. | P |
| S18 | `x-tenant-id` é lido sem garantia de origem; o matcher do proxy exclui caminhos terminados em `.png` etc. | `lib/tenant.ts:26`; `proxy.ts:258` | Assinar o header ou resolver o tenant de novo no servidor. | P |

### 1.3 Engenharia que protege o sistema

| # | Lacuna | Benefício |
|---|---|---|
| E1 | **Nenhum monitoramento de erros** (Sentry/Vercel Observability), nenhum `error.tsx`/`not-found.tsx`. Erro cai na tela padrão do Next em inglês e ninguém fica sabendo. | Saber do erro antes do usuário reclamar; tela de erro em português com caminho de volta. (P) |
| E2 | **Zero testes automatizados versionados** (o Playwright está instalado, mas não há `*.spec.ts`). Os E2E citados nas memórias foram descartados. | Um smoke E2E de 20 fluxos críticos (login, ordem, voto, filiação, reserva) evita regressão como a do commit parcial de 29/09. (M) |
| E3 | **Sem CI**: nada roda `tsc`/`eslint`/`build` antes do deploy. | GitHub Actions ou Vercel checks bloqueando deploy quebrado. (P) |
| E4 | **Sem `npm audit`/Dependabot**; `jsqr` sem manutenção desde 2021. | Alertas automáticos de CVE. (P) |
| E5 | **Backup/PITR não documentado**; plano de restauração inexistente no repositório. | Confirmar PITR no Supabase e testar uma restauração. (P) |
| E6 | **Rotação da ANTHROPIC_API_KEY** ainda pendente desde 07/09. | (P) |

---

## 2. Qualidade de uso e automação

### 2.1 Para funcionários (painel)

| # | Proposta | Situação hoje | Benefício | Esforço |
|---|---|---|---|---|
| U1 | **Caixa de entrada unificada de pendências** na home: ordens na minha alçada, férias/faltas/diárias/reembolsos a avaliar, filiações e fichas pendentes, pedidos de espaço, assinaturas aguardando, compras a receber, com contadores na sidebar. | A home mostra só demandas (máx. 8), aniversários, agenda e notícias; nada por papel (`app/painel/page.tsx`; `lib/db/painel.ts:162-170`). | Ninguém mais precisa "passear" por 16 hubs para descobrir o que o espera. Reduz o tempo de ciclo de todas as esteiras. | M |
| U2 | **Aviso ao aprovador + lembrete + escalonamento** em toda esteira (ordens por alçada, compras, férias, diárias, reembolsos, filiação, cessão, assinaturas). | Só faltas (sino), espaços (sino) e viagens (e-mail) avisam o avaliador; nenhuma esteira tem prazo, lembrete ou escalonamento. | Pagamentos e pedidos não param esquecidos; prazo visível para quem pede. | M |
| U3 | **Notificações consistentes com preferência por canal** (sino, e-mail, Telegram) e por tipo. Sino em tempo real (Realtime ou polling). | Telegram cobre 9 eventos; e-mail e sino sem preferência; sino só atualiza ao recarregar; nada no portal nem no hotel. | A pessoa escolhe como quer ser avisada; menos ruído, menos coisa perdida. | M |
| U4 | **Busca global (Ctrl+K)**: filiado, fornecedor, ordem, contrato, veículo, funcionário, página do menu. | Só busca rápida de filiados; 80 subáreas alcançáveis apenas pelos cartões dos hubs. | Economia diária de cliques em 369 páginas. | M |
| U5 | **Confirmação padrão (AlertDialog) e erro por campo.** | `confirm()` nativo em ~100 arquivos; erro único no topo ou rodapé, em `<p>` sem `role=alert` em ~99 arquivos; sucesso de três formas diferentes; `<select>` nativo em 203 arquivos com a constante `SELECT` copiada 168 vezes. | Menos exclusões por engano, menos "não entendi o que deu errado". | M |
| U6 | **Telas de erro e 404 em português**, com identidade e botão de voltar. | Inexistentes (139 chamadas `notFound()` caem no 404 inglês do Next). | Profissionalismo e menos chamados. | P |
| U7 | **Corrigir o fuso nos 4 pontos restantes** (urnas, pedido público de espaço, visita técnica, bloqueio de agenda). | Gravam 3h deslocado em produção (`urnas/[id]/actions.ts:29-32`; `espacos-solicitacao.ts:351,404`; `espacos-esteira.ts:401`; `espacos.ts:698`). | Horário de urna e de visita certos. | P |
| U8 | **Paginação no servidor e fim do teto silencioso de 1.000 linhas.** | 43 páginas carregam tudo e cortam em memória; `.limit(2000)` em fornecedores, contratos, compras e indicadores financeiros, que na prática param em 1.000. | Listas que não mentem e tela que não trava quando o volume cresce. | M |
| U9 | **Autosserviço do funcionário visível**: "Minha área" (contracheque, ponto, férias, ASO, diárias, reembolsos) no menu principal e na home. | Escondido no menu do avatar (`app-sidebar.tsx:266-271`). | Funcionário comum deixa de ver uma sidebar vazia. | P |
| U10 | **Padronizar nomes**: Aquisição/Compras, Viagens/Passagens e hospedagens, Votações/Votação/Assembleias, Manual/Ajuda, Ferramentas/Ferramentas administrativas. | Divergem entre menu, título, rota e manual. | Menos confusão em treinamento e no manual. | P |
| U11 | **Ajuda ligada à tela**: ícone "?" em cada hub levando ao artigo do manual; "O que há de novo" após cada deploy; tour de primeiro acesso. | Manual completo (128 MDX) mas nenhuma tela aponta para ele. | O investimento no manual passa a ser usado. | P |
| U12 | **Canal de feedback interno** ("Relatar problema / sugerir") que abre uma Demanda com a URL, usuário e print. | Inexistente. | Você recebe os bugs com contexto em vez de por WhatsApp. | P |
| U13 | **Loading por rota e detalhes**: `loading.tsx` em portal, hotel e `/painel`; esqueleto de detalhe diferente do de hub; `Suspense` nos blocos lentos da home. | 45 loadings, todos no painel; consultas em cadeia (`compras/[id]/page.tsx:207-210` consulta dentro de laço). | Sensação de velocidade. | P |
| U14 | **Templates de e-mail editáveis pela entidade** (assunto, cabeçalho, assinatura) em vez de HTML em ~50 chamadas no código. | Só parabéns e mala direta são editáveis. | Comunicação da entidade muda sem deploy. | M |
| U15 | **Ações em lote** nas listas principais (filiados, ordens, fornecedores): selecionar e exportar, mudar situação, enviar mensagem. | Raras (3 pontos). | Operações de fim de mês em minutos. | M |

### 2.2 Para diretores

| # | Proposta | Situação hoje | Benefício | Esforço |
|---|---|---|---|---|
| D1 | **Home do diretor** (vista por papel): ordens aguardando sua alçada, assinaturas pendentes, agenda da semana, próximas assembleias/negociações, KPIs de filiação e caixa, pedidos de viagem/diária. | Mesma home de todos; "Minha diretoria" só em Meu perfil (`lib/db/perfil-diretor.ts`). | O diretor abre o sistema e sabe o que decidir hoje. | M |
| D2 | **Aprovar e assinar pelo celular**: ordem de pagamento, ofício, minuta, com 2FA. Instalável como PWA (manifest + service worker) com push. | Sem PWA, sem push, sem home mobile. | Alçadas não travam porque o diretor viajou. | M |
| D3 | **Telegram transacional**: além de consultar, aprovar/recusar ordens dentro da alçada e confirmar presença em reunião pelo bot. | Bot só consulta (contracheque, férias, diárias, informes, ASOs, frota, filiado). | O canal que o diretor já usa vira canal de decisão. | M |
| D4 | **Alertas de mandato e instâncias**: mandato da diretoria, assento em instância (`mandato_fim`), vigência do empregador, CIPA. | Datas existem, nenhum alerta. | Eleições e renovações preparadas com antecedência. | P |
| D5 | **Relatório da diretoria em um clique** (mensal): filiação, arrecadação, caixa, pendências, ações do mês, com IA redigindo o texto a partir dos números. | Inexistente. | Reunião de diretoria com dados do sistema, não de planilha. | M |

### 2.3 Para filiados (portal)

| # | Proposta | Situação hoje | Benefício | Esforço |
|---|---|---|---|---|
| F1 | **Carteirinha digital** (QR verificável em `/verificar`) e **declaração de filiação em PDF** na hora. | Inexistentes; dependem da secretaria. | Fim do pedido mais comum à secretaria; convênios conferem o QR. | P |
| F2 | **Atendimento/ouvidoria no portal**: abrir solicitação (jurídico, saúde, cadastro, reembolso, reclamação), acompanhar a situação, receber resposta. Do lado do painel vira uma Demanda com SLA. | Nenhum canal; "procure o sindicato". | Rastreabilidade de todo pedido do filiado; indicador de tempo de resposta. | M |
| F3 | **Reembolso e desfiliação pelo portal** com upload e esteira. | Reembolso só no painel; desfiliação comum "procure o sindicato". | Menos filas presenciais. | M |
| F4 | **Notificações e e-mail no portal**: situação de cupom, reserva, evento, votação aberta, resposta do atendimento; preferência de canal e WhatsApp (API) para quem autorizou. | Sem sino no portal; WhatsApp só via link manual `wa.me`. | Filiado informado sem o sindicato ligar. | M |
| F5 | **Portal mobile-first**: navegação inferior com 4–5 itens, página ativa marcada, alvos ≥ 44px, tabelas viram cards. | Menu superior com 11 itens rolando de lado, sem página ativa, alvos ~32px (`portal-shell.tsx:13-25, 101-113`). | A maioria acessa pelo celular; hoje o portal não foi desenhado para isso. | M |
| F6 | **Minha contribuição**: histórico de descontos por mês/fonte, 2ª via quando a forma for boleto/Pix, aviso de contribuição em falta antes de virar inadimplência. | Contribuições só no painel; inadimplência só como relatório interno. | Transparência reduz conflitos e evita desfiliação por inadimplência. | M |
| F7 | **Saúde: agendamento e acompanhamento** de atendimentos pelo portal. | Portal só mostra histórico. | Menos telefonemas. | M |
| F8 | **Portabilidade LGPD**: baixar meus dados; registro de consentimento versionado. | Só rótulo. | Conformidade real com a LGPD. | P |
| F9 | **Calendário**: exportar assembleias, eventos e reservas em `.ics`/Google Calendar. | Inexistente. | Presença maior em assembleias. | P |

### 2.4 Automações que removem trabalho manual

| # | Proposta | Situação hoje | Benefício | Esforço |
|---|---|---|---|---|
| A1 | **Conciliação bancária**: importar OFX/CNAB retorno, casar com ordens pagas e com depósitos das fontes (`filiacao_recebe_comprovacao`, que chegou vazia do Bubble). | Baixa de pagamento e comprovação de depósito manuais. | Financeiro fecha o mês com o extrato, não com a memória. | G |
| A2 | **Remessa de pagamento (CNAB/Pix em lote)** gerada pelas ordens "A pagar". | Pagamento um a um no banco. | Elimina digitação e erro de Pix. | G |
| A3 | **Boleto/Pix da contribuição** para `forma_recebimento` boleto/pix, com baixa automática. | Só rótulo. | Receita de quem não é consignado deixa de depender de cobrança manual. | G |
| A4 | **Assinatura gov.br validada**: verificar a assinatura ICP/gov.br do PDF enviado (ficha, carta de oposição, minuta) em vez de confiar no upload. | Fluxo manual, sem validação. | Fecha uma porta de fraude e dispensa conferência humana. | M |
| A5 | **WhatsApp por API** (Meta Cloud API) para parabéns, mala direta autorizada, avisos de cupom/reserva, votação aberta. | Link manual um a um. | Alcance muito maior que e-mail para filiados. | M |
| A6 | **Alertas por push/e-mail do que hoje é "só na tela"**: contratos, ACT, CNH, seguro, ASO, férias vencendo, ajudas institucionais, faturas de viagem, custeios, ordens vencidas. | Só a preventiva de veículo dispara aviso. | Os prazos passam a procurar o responsável. | P |
| A7 | **Leitura por IA generalizada**: contracheque/espelho (hoje upload sem leitura), notas de viagem, comprovantes de reembolso, atestados (CID, dias), documentos de fornecedor (certidões, validade). | IA já lê nota fiscal, CAT, acordos, atas, abastecimentos. | Menos digitação; validade de certidão alimenta o bloqueio de pagamento. | M |
| A8 | **Assistente de IA com dados** no painel e no Telegram: "quantos filiados ativos na Petrobras?", "ordens acima da minha alçada esta semana?". | IA de ajuda só lê o manual; Telegram responde texto livre sem dados. | Consulta sem abrir relatório. | M |
| A9 | **API/webhooks de saída** para contador, Power BI, site da entidade. | Inexistentes. | Integrações sem exportar CSV à mão. | M |

---

## 3. Informação para tomada de decisão

### 3.1 Diagnóstico

- A home não tem **nenhum KPI de gestão**; os indicadores existem dentro de cada módulo (Filiados, Financeiro, Compras, Pessoal, Saúde, Veículos, Hospedagem) e só aparecem para quem abre o módulo.
- **Não há série histórica** de nada relevante à direção: evolução de filiados, arrecadação mensal por fonte/empregador, churn. Os dados permitem calcular (vínculos datados, 609 mil lançamentos de `filiacao_recebe` com remessa AAAAMM).
- **Financeiro sem visão gerencial**: sem fluxo de caixa, orçado × realizado, despesa por centro de custo/mês, previsão, filtro por período, exportação de ordens, balancete, exportação contábil.
- **Camada analítica inexistente**: só 2 views, nenhuma materialized view, nenhuma RPC de agregação; tudo é calculado em memória lendo a base em lotes com cache de 10 min. Falta índice em `filiacao_recebe.remessa_id` (timeout já observado).
- **Exportação** ausente em Financeiro, Receitas, Pessoal, Veículos, Compras, Eventos, Votações; nenhuma em XLSX.
- **Sem telemetria**: não se sabe quais telas são usadas, nem abertura/clique de e-mail.

### 3.2 Propostas

| # | Proposta | Benefício | Esforço |
|---|---|---|---|
| I1 | **Camada analítica no banco**: views materializadas (`fato_filiacao_mensal`, `fato_arrecadacao_mensal`, `fato_despesa_mensal`, `fato_frota_mensal`) atualizadas por cron noturno + índices faltantes. | Base de tudo abaixo; indicadores em milissegundos; sem risco de timeout. | M |
| I2 | **Painel executivo** (home da gestão e do diretor): filiados ativos e variação, filiações × desfiliações 12 meses, arrecadação 12 meses por tipo, saldo de caixa e a pagar 30 dias, inadimplência, pendências críticas. | Decisão com número, não com percepção. | M |
| I3 | **Financeiro gerencial**: fluxo de caixa projetado (ordens a pagar por vencimento + receitas previstas), despesa por centro de custo/departamento/mês, orçado × realizado por centro de custo (o rateio já existe), ordens vencidas. | Direção enxerga o caixa antes de aprovar. | M |
| I4 | **Prestação de contas e contador**: balancete por centro de custo, exportação contábil (CSV/XLSX de lançamentos com plano de contas), relatório ao conselho fiscal. | Conselho fiscal e contador param de pedir planilha. | M |
| I5 | **Arrecadação por empregador/fonte**: série mensal, pagantes × ativos, fontes em atraso, comparação com o mês anterior; aba na página do empregador. | Detecta queda de repasse em dias, não meses. | P (após I1) |
| I6 | **Churn e retenção**: motivo de desfiliação (lista fechada), taxa mensal por fonte/empregador/faixa etária, tempo médio de filiação. | Campanhas de retenção direcionadas. | P |
| I7 | **Custos consolidados**: frota (por veículo e por km somando abastecimento, manutenção, multas, aluguel), hospedagem (custo e ocupação usando `custo_entidade`), viagens (por diretor/departamento), patrimônio com valor. | Saber o que custa cada decisão. | M |
| I8 | **Exportação universal XLSX** (componente único) em toda lista, respeitando os filtros da tela. | Fim do "me manda em Excel". | P |
| I9 | **Engajamento**: participação em votações por fonte/idade, presença em eventos entre eventos, abertura/clique de e-mail (webhook do Brevo), uso do portal (último acesso, telas). | Mede se a comunicação funciona. | M |
| I10 | **Alertas de gestão com assinatura**: resumo semanal por e-mail/Telegram para gestores (pendências, vencimentos, anomalias, KPIs). | Gestão proativa sem abrir o sistema. | P (após I1) |

---

## 4. Sugestão de ondas

1. **Onda 0 — segurança imediata (1 semana):** S1, S2, S3, S4, S8, S13, S14, S17 + cabeçalhos (S5) + Sentry e `error.tsx` (E1).
2. **Onda 1 — proteção estrutural (2–3 semanas):** S6, S7, S9, S10, S11, S12, S16, E2, E3, E4, E5, U7.
3. **Onda 2 — dia a dia (3–4 semanas):** U1, U2, U3, U4, U5, U6, U9, U10, U11, U12, A6, D4.
4. **Onda 3 — informação (3–4 semanas):** I1, I2, I3, I5, I8, I10, U8.
5. **Onda 4 — filiado e diretor (4–6 semanas):** F1, F2, F4, F5, F6, D1, D2, D3, A5, I4, I6, I7.
6. **Onda 5 — integrações financeiras (G):** A1, A2, A3, A4, A9.
