# Plano da Onda 0 — segurança imediata

Escopo: os itens S1, S2, S3, S4, S5, S8, S13, S14, S17 e E1 da avaliação de 03/10 (`docs/avaliacao-sistema-2026-10-03.md`), mais dois itens opcionais (0+) que respondem à pergunta sobre "sou humano". Caminhos relativos a `confluir/`. Estimativa total: **5 dias úteis** de uma pessoa, com deploy ao fim de cada dia.

Princípios que valem para todos os itens:
- Nada que dependa de SQL vai ao ar antes de o SQL rodar em produção (lição do commit parcial de 29/09: conferir a árvore commitada com `tsc` antes do push).
- Cada item tem "como verificar". Nada é dado como pronto sem a verificação executada.
- Nenhuma mensagem nova revela se um CPF ou e-mail existe.

---

## Andamento

- **Dia 1 — FEITO em 03/10/2026.** S2, S8, S13, S14, S17 e S5 (sem CSP) implementados, `tsc` e `eslint` limpos. Verificado no servidor local: os cinco cabeçalhos presentes em `/login`; `next=//example.com` em `/auth/confirm` cai em `/login`; teste de ataque do S2 (pedido de código na oposição com o e-mail da conta fiscal do tenant demo e um CPF alheio) deixou o metadata da conta intacto. Pendente de ação manual: trocar a senha de `fiscal@confluir.local` no dashboard e gravar `DEMO_FISCAL_SENHA` no `.env.local`.
- **Dias 2–3 — NO AR em 03/10/2026 (commit 13d7091).** SQL rodado; migração aplicada (4 contas vinculadas, 0 recusas após dar à filiação demo "Mariana" o e-mail `demo@confluir.local` como corporativo, porque a conta demo precisava bater com o cadastro). Verificado no demo local: (1) ataque — sessão de não filiado trocou `user_metadata.cpf` pelo CPF de uma filiada via API do Supabase (HTTP 200) e o portal mandou para o login, a oposição seguiu "Não filiado"; (2) oposição por código: conta nasce sem CPF no metadata, pendência consumida, identidade `nao_filiado` gravada "por código"; (3) link mágico do portal: `/auth/confirm` consumiu a pendência e abriu `/portal/inicio` como a filiada; (4) voto por link pessoal: voto gravado com hora `19:00:00`, participação `19:05:39` com comprovante, segunda tentativa "já votou". Observação: o CPF do eleitor "Roberto" do demo é fictício e inválido, o que já impedia o voto online dele antes desta mudança (dado de seed, não regressão). Texto original do item: S1: tabela `auth_identidades` + `auth_vinculos_pendentes` (`supabase/auth-identidades.sql`), helpers em `src/lib/auth-identidade.ts`, cinco leituras e quatro fluxos trocados, `portal_nao_filiado` passa a ser gravado pelo CPF da identidade, indicador de "contas no portal" lê a tabela nova; script `scripts/migrar-identidades-auth.mjs` (dry-run por padrão). S3: conferência de CPF devolve só primeiro nome e e-mail mascarado; nome, e-mail e CPF do pedido saem do cadastro e o código vai ao e-mail do cadastro; mensagem única para "não encontrado/inativo". **Testado na tela do demo** (Camila → "c••••••••@e••••••.com"; CPF alheio → mensagem genérica). S4: nos cinco caminhos de voto (filiado, e-mail, link pessoal, urna com mesário, urna digital e em separado) a participação é reservada ANTES de gravar o voto, com `select` das linhas afetadas, e `voto_online.created_at` vai truncado na hora. **Testado no banco do demo**: 10 reservas simultâneas do mesmo apto, 1 vence. O que falta: rodar o SQL, `migrar-identidades-auth.mjs --dry-run` e `--aplicar`, teste de ataque do S1 e fluxos felizes (login por senha, link mágico, código na votação, oposição), e só então o push (o código em produção sem a tabela derruba o portal).

- **Dia 4 — NO AR em 03/10/2026.** E1: `@sentry/nextjs` 11 com `src/instrumentation.ts` (`onRequestError`), `instrumentation-client.ts`, configs de servidor e edge, filtro `lib/sentry-filtro.ts` (sem cookies, corpo, tokens de URL; CPF mascarado); `global-error.tsx`, `error.tsx` na raiz, no painel, no portal e no hotel; `not-found.tsx` em português (verificado: status 404 com a tela nova). Sem `withSentryConfig` (sem túnel e sem source maps por enquanto). CSP em `Content-Security-Policy-Report-Only`, só em produção, relatando em `/api/csp-relatorio` (verificado: 204). 0+a: componente `<Turnstile>` em todos os formulários de autenticação (painel, portal, hotel, votação, oposição, mesário, apurador, primeiro acesso, recuperação, reversão da filiação coletiva) e `lib/turnstile.ts` nas actions, tudo inerte sem `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`. 0+b: cadência de 1 código/min e 5/h por e-mail em `codigo-acesso.ts`, tolerante à tabela ausente; SQL em `supabase/auth-codigos-cadencia.sql`. `next build` de produção: exit 0.
- **Dia 5 (03/10, noite):** SQL da cadência rodado; DSN do Sentry na Vercel e redeploy feitos pelo usuário. Verificado em produção: os seis cabeçalhos (inclusive a CSP em relatório) presentes em `/login`; SDK 11.4.0 inicializado no navegador com client; evento de teste `03eedf4f9ce747fdac60a4fab1ec03c3` entregue ao host `ingest.de.sentry.io` (transporte confirmou a entrega).
- **Ainda para o usuário:** criar o site no Turnstile, gravar as duas chaves na Vercel e ligar "Captcha protection (Turnstile)" no dashboard do Supabase com a secret; ligar "Leaked password protection" no Supabase; trocar a senha de `fiscal@confluir.local`; após uma semana, trocar a CSP de Report-Only para ativa se `/api/csp-relatorio` não acusar nada relevante.

## Ordem de execução

| Dia | Itens | Por quê nessa ordem |
|---|---|---|
| 1 | S2, S8, S13, S14, S17, S5 (cabeçalhos sem CSP) | Pequenos, sem SQL, fecham portas abertas hoje. Deploy no fim do dia. |
| 2–3 | S1 | O maior; precisa de tabela nova, migração e troca de 5 leituras + 4 fluxos. |
| 3 | S3, S4 | S4 precisa do S1 pronto (identidade do eleitor). |
| 4 | E1, CSP em modo relatório, 0+ (Turnstile e cadência de códigos) | Observabilidade antes de ir para a onda 1. |
| 5 | SQL em produção, migração de identidades, verificação completa, manual | Fecho. |

---

## S2 — Metadata sobrescrito antes do código ser confirmado (dia 1, 2 h)

**Hoje.** `src/lib/codigo-acesso.ts:45-58`: lista os primeiros 1.000 usuários, acha a conta pelo e-mail e, se ela já existe, **sobrescreve `user_metadata`** com o que o formulário público mandou, antes de qualquer código ser conferido. É chamado sem login por oposição (`src/app/portal/oposicao/actions.ts:114`), votação (`src/app/votar/[id]/actions.ts:130, 213`), portal (`src/app/portal/actions.ts:88`), mesário e apurador.

**Mudanças.**
1. `enviarCodigoAcesso` deixa de receber `metadata` para contas existentes. Para conta nova, grava no máximo `{ tipo }` (rótulo de redirecionamento, não identidade).
2. Trocar `listUsers({perPage:1000})` por: tentar `createUser`; se o erro for "já registrado" (`email_exists` / status 422), seguir para `generateLink`. Zero listagem.
3. `pelaSupabase()` (fallback via SMTP do Supabase) deixa de passar `data: metadata`.
4. A identidade (CPF) passa a ser gravada só pelo mecanismo do S1, depois do código conferido.

**Verificação.** Com uma conta de funcionário existente, pedir código na oposição informando o e-mail dele e um CPF qualquer: o `user_metadata` da conta não muda (conferir no dashboard do Supabase). O fluxo normal de oposição, votação por código e magic link do portal continuam funcionando.

---

## S8 — Open redirect (dia 1, 15 min)

**Hoje.** `src/app/auth/confirm/route.ts:31` aceita `next=//evil.com`.

**Mudança.** `const destino = /^\/(?![\/\\])/.test(next) ? next : "/painel"`. Aplicar a mesma regra em `src/app/login/actions.ts:72` (hoje `startsWith("/painel")`, já seguro) e conferir `src/app/acesso/senha/actions.ts:71` (já trata `//`).

**Verificação.** `GET /auth/confirm?token_hash=x&type=magiclink&next=//example.com` redireciona para `/login?erro=...`, nunca para fora.

---

## S13 — Código OTP no log (dia 1, 30 min)

**Hoje.** Quando o e-mail falha, o código vai para o log em `src/app/filiar/actions.ts:123, 143`, `src/app/evento/[slug]/actions.ts:118`, `src/app/inscricao/[token]/actions.ts:91`, `src/app/meus-dados/actions.ts:47`. Em produção, o log da Vercel é lido por quem tem acesso ao projeto, e fica retido.

**Mudança.** Função única `registrarFalhaEnvioCodigo(fluxo, email)` em `src/lib/email.ts` que loga só `fluxo` e e-mail mascarado. O código só é impresso quando `process.env.NODE_ENV !== "production" && process.env.EMAIL_SANDBOX === "1"` (teste local, que era o motivo original).

**Verificação.** Forçar falha de envio (chave do Brevo inválida em preview) e ler o log: sem código.

---

## S14 — Mensagens que entregam quem existe (dia 1, 1 h)

| Onde | Hoje | Passa a |
|---|---|---|
| `src/app/login/actions.ts:114-118` | "Esta conta já foi ativada…" | A resposta genérica, que passa a dizer sempre: "Se o e-mail estiver cadastrado, você receberá um convite. Se a conta já foi ativada, use 'Esqueci minha senha'." |
| `src/app/portal/actions.ts:27-30` | "Seu cadastro não possui email" (confirma que o CPF existe) | "CPF ou senha incorretos." A tela ganha um texto fixo: "Sem e-mail no cadastro? Procure o sindicato." |
| `src/lib/db/votacao-primeiro-acesso.ts:309` | "Já há voto registrado para este CPF…" | "Não foi possível confirmar os seus dados. Procure o sindicato." O conflito continua sendo gravado para a equipe (`marcarConflito`). |
| `src/app/votar/[id]/actions.ts:94-113` | Distingue "não está na lista", "sem e-mail", "não ativo" | Uma frase só: "Não foi possível localizar um eleitor apto com este CPF. Procure a mesa." A exceção é quando a pessoa já provou a identidade (depois do código). |

**Verificação.** Testar cada formulário com CPF/e-mail existente e inexistente: mesma resposta nos dois casos.

---

## S17 — Senha fixa de demonstração (dia 1, 20 min)

**Mudança.** `scripts/setup-fiscal-demo.mjs:15` e `scripts/prints-conselho-fiscal.mjs:26` leem `DEMO_FISCAL_SENHA` do ambiente e falham se ela não existir. Trocar a senha da conta `fiscal@confluir.local` no tenant demo pelo dashboard. Registrar a nova no `.env.local` (não no repositório).

---

## S5 — Cabeçalhos de segurança (dia 1 sem CSP; dia 4 CSP em relatório)

**Dia 1**, bloco `headers()` em `next.config.ts` para `/:path*`:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()
```

- `camera=(self)` porque a recepção lê QR com `jsqr`.
- `X-Frame-Options: DENY` vale para o app inteiro. Nenhuma página do Confluir precisa ser embutida por terceiros; os iframes que existem (`src/app/assinar/[token]/page.tsx:184`, `src/app/portal/oposicao/[id]/oposicao-flow.tsx:53`, `src/app/painel/comunicacao/slides/[id]/page.tsx:181`) embutem conteúdo externo (PDF do Storage, vídeo), o que não é afetado.

**Dia 4**, `Content-Security-Policy-Report-Only` (ainda não bloqueia), ponto de partida:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.supabase.co https://cdn.bubble.io;
font-src 'self' data:;
connect-src 'self' https://<projeto>.supabase.co https://viacep.com.br;
frame-src 'self' https://*.supabase.co https://www.youtube.com;
frame-ancestors 'none';
base-uri 'self'; form-action 'self';
report-uri <endpoint do Sentry ou /api/csp-report>
```

- `'unsafe-inline'` em script fica porque `/tv/[slug]/tela-tv.tsx:226-231` injeta scripts inline e o Next injeta os dele. A versão com nonce (gerado no `proxy.ts`) fica para a onda 1.
- Conferir antes de ligar: imagens migradas do Bubble (`cdn.bubble.io`, citadas em `noticias/[id]/page.tsx:36`), vídeo dos slides (origem real do iframe), fontes (o `next/font` serve local, então não precisa do Google).
- Uma semana em relatório, depois vira `Content-Security-Policy`.

**Verificação.** `curl -I https://<tenant>.confluir.online/login` mostra os cabeçalhos; securityheaders.com dá nota A; nenhum relatório de CSP relevante após uma semana.

---

## S1 — Identidade do filiado/trabalhador por `user_metadata.cpf` (dias 2–3)

**Hoje.** Cinco leituras decidem quem é a pessoa a partir de um campo que ela mesma pode alterar com `supabase.auth.updateUser({ data: { cpf } })` e a anon key pública:
- `src/lib/auth.ts:131` (portal), `:172` (trabalhador/oposição), `:279` (alternador de áreas)
- `src/app/votar/[id]/actions.ts:291` (voto público), `src/app/votar/[id]/page.tsx:125`

Três escritas: `src/app/portal/actions.ts:60`, `src/app/portal/oposicao/actions.ts:147`, `src/lib/codigo-acesso.ts:51-56`.

### Desenho

**Fonte de verdade nova: tabela `auth_identidades`** (mesmo padrão que já existe para funcionário em `usuarios.auth_user_id` e para hotel em `hospedagem_hotel_usuarios.auth_user_id`).

```sql
create table auth_identidades (
  auth_user_id        uuid primary key,
  emp_proprietaria_id uuid not null references empresa(id),
  tipo                text not null check (tipo in ('filiado','nao_filiado')),
  cpf                 char(11) not null,
  nome                text,                    -- só para nao_filiado
  vinculada_em        timestamptz not null default now(),
  vinculada_por       text not null check (vinculada_por in ('senha','codigo','migracao'))
);
-- um CPF = uma conta por tenant
create unique index auth_identidades_cpf_unico on auth_identidades (emp_proprietaria_id, cpf);
alter table auth_identidades enable row level security;   -- deny-all; só service role
```

**Pendência de vínculo**, para os fluxos por código (o servidor sabe o par e-mail↔CPF *antes* de mandar o código, e o consome *depois* de o código ser conferido; o formulário nunca escolhe o CPF):

```sql
create table auth_vinculos_pendentes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  email text not null,
  tipo text not null,
  cpf char(11) not null,
  nome text,
  expira_em timestamptz not null,   -- 15 min, igual ao código
  created_at timestamptz default now()
);
create index on auth_vinculos_pendentes (emp_proprietaria_id, lower(email));
```

**Helpers em `src/lib/auth-identidade.ts`** (server-only):
- `identidadeDaConta(userId)` → `{tipo, cpf, nome} | null`, com `cache()` por request. É a **única** leitura.
- `vincularIdentidade({ userId, emailVerificado, tipo, cpf, nome, por })` com as regras:
  1. `filiado`: o CPF precisa resolver a uma filiação cujo `email_pessoal` ou `email_corporativo` seja **igual** (lower, `eq`, nunca `ilike`) ao e-mail verificado da conta. É a prova de posse.
  2. `nao_filiado`: o CPF não pode ser de filiado ativo; a conta não pode ter `usuarios.auth_user_id` (funcionário) nem identidade `filiado`.
  3. Se a conta já tem identidade com outro CPF → recusa ("Esta conta de acesso está vinculada a outro CPF. Procure o sindicato."), que é a regra legada de `portal/actions.ts:50-56`.
  4. Se o índice único acusar que o CPF já pertence a outra conta → mesma recusa. Nada é sobrescrito.
- `registrarVinculoPendente(...)` e `consumirVinculoPendente(userId, emailVerificado)`.

### Fluxos

| Fluxo | Onde grava hoje | Passa a |
|---|---|---|
| Portal, CPF + senha | `portal/actions.ts:55-63` | Depois de `signInWithPassword` com o e-mail do cadastro: `vincularIdentidade(..., por:'senha')`. Mantém a recusa quando a conta já é de outro CPF. |
| Portal, link mágico | `portal/actions.ts:85-92` → `/auth/confirm` | Antes de enviar: `registrarVinculoPendente(email do cadastro, 'filiado', cpf)`. Em `/auth/confirm`, após `verifyOtp` com sucesso: `consumirVinculoPendente`. |
| Votação, filiado por código | `votar/[id]/actions.ts:129-134` e `confirmarTokenEleitor` | Mesmo par registrar/consumir; consumo em `confirmarTokenEleitor` após `verifyOtp`. |
| Votação, voto público | `votar/[id]/actions.ts:291`, `page.tsx:125` | `identidadeDaConta(user.id)`. |
| Oposição, não-filiado | `oposicao/actions.ts:96-168` | `enviarCodigoTrabalhador` registra a pendência (cpf, nome). `confirmarCodigoTrabalhador`, após `verifyOtp`: consome a pendência e chama `vincularIdentidade(nao_filiado)`; `portal_nao_filiado` ganha coluna `auth_user_id` e passa a ser atualizado **por ela**, não por CPF (hoje `:151-157` troca nome e e-mail de qualquer CPF). |
| Sessões | `lib/auth.ts:131, 172, 279` | `identidadeDaConta`. |
| Redirecionamento pós-senha | `acesso/senha/actions.ts:73` (`destinoDaConta(user_metadata.tipo)`) | Pode continuar lendo `user_metadata.tipo`: só escolhe a tela de destino, não dá acesso. |

### Migração (`scripts/migrar-identidades-auth.mjs`)

1. Pagina `listUsers` (laço, 1.000 por página) e, para cada conta com `user_metadata.cpf`, aplica **as mesmas regras** de `vincularIdentidade` (`por:'migracao'`).
2. Modo `--dry-run` primeiro: imprime quantas vinculam e lista as que falham (e-mail compartilhado entre pessoas, CPF de filiado inativo, CPF em duas contas) num CSV para a secretaria.
3. As que falharem **não** entram; a pessoa vincula de novo no próximo login por senha ou código, quando prova a posse do e-mail. Avisar a secretaria para o caso de ligações.
4. Depois da migração, um segundo passo (opcional, após uma semana sem reclamação) limpa `user_metadata.cpf` de todas as contas, para que nenhum código antigo volte a confiar nele.

### Verificação
- Teste de ataque: com conta nova criada pela oposição, chamar `supabase.auth.updateUser({ data: { cpf: '<cpf de filiado ativo>' } })` no console do navegador e abrir `/portal/inicio`: deve cair no login. Repetir em `/votar/<id>`: sem cédula.
- Fluxos felizes: login por senha, link mágico, código na votação, oposição de não-filiado, alternador de áreas para quem é funcionário e filiado.
- `grep -rn "user_metadata" src` só pode devolver o `tipo` de redirecionamento.

---

## S3 — Nome e e-mail entregues por CPF sem login (dia 3, 2 h)

**Hoje.** `conferirFiliadoAction` (`src/app/espaco/[slug]/actions.ts:30-36`) devolve nome completo e e-mail de qualquer CPF ativo; o formulário só usa isso para pré-preencher (`pedido-form.tsx:155-180`).

**Mudanças.**
1. `filiadoPeloCpf` passa a devolver só `{ encontrado: true, primeiroNome, emailMascarado }` (ex.: "Maria", "m***a@gmail.com"). O solicitante digita o próprio e-mail.
2. O código de confirmação do pedido (que já existe no fluxo, `confirmarPedido`/`reenviarCodigo`) vai **para o e-mail do cadastro** quando o espaço é "só para filiados", não para o e-mail digitado. Isso é o que de fato prova que quem pede é o filiado.
3. Mensagem única para "não encontrado" e "não ativo": "Não foi possível confirmar uma filiação ativa com este CPF. Procure a secretaria."
4. Cadência: no máximo 5 conferências por token de pedido e por hora; a contagem fica na própria solicitação (campo `conferencias`), sem infraestrutura nova. O rate limit por IP fica para a onda 1.

**Verificação.** Com um CPF ativo, a resposta não traz nome completo nem e-mail; o código chega no e-mail do cadastro.

---

## S4 — Sigilo do voto e voto duplo (dia 3, 4 h)

**Hoje.** Em `src/lib/db/votacao-portal.ts:559-583` (e `~988`, e `votacao-mesarios.ts:1350-1364`): o mesmo `agora` vai para `voto_online.created_at` e para `aptos.hora_voto`, permitindo cruzar os dois pelo horário; e a ordem é "checa já votou → insere votos → marca participação", sem transação nem conferência de linhas afetadas.

**Mudanças, nos três caminhos (filiado, e-mail corporativo, urna digital):**
1. **Reservar a participação primeiro**: `update voto_assembleias_aptos set hora_voto = agora where <apto> and hora_voto is null` com `.select('id')`. Se voltar 0 linhas → "Você já votou nesta assembleia." Só então inserir em `voto_online`. Se o insert falhar, desfazer (`hora_voto = null`) e devolver o erro. Em separado: o mesmo com `voto_em_separado.votou_em`.
2. **Desacoplar o horário**: `voto_online.created_at` passa a receber a hora **truncada** (`date_trunc('hour')`), que basta para a apuração e para gráficos por período. O horário exato continua só no comprovante (apto), como o comentário de `voto-comprovante.ts:17-21` promete. Conferir antes os consumidores de `voto_online.created_at` (`grep -rn "created_at" src/lib/db/votacao-apuracao*.ts src/lib/db/assembleias.ts`).
3. **Índice** que impede o segundo comprovante: já existe `voto_aptos_comprovante_codigo_idx`; acrescentar `check` lógico via trigger simples: `hora_voto` não pode voltar de não-nulo para outro não-nulo.
4. Follow-up (onda 1): mover os passos 1–2 para uma função SQL `registrar_voto(...)` em transação, `security definer` só para `service_role`, como `hospedagem_gravar_alocacao`.

**Verificação.** Script com 10 POSTs simultâneos do mesmo eleitor: 1 voto em `voto_online`, 9 recusas. Em `voto_online`, nenhum `created_at` com minutos/segundos. Comprovante continua mostrando o horário exato.

---

## E1 — Monitoramento de erros e telas de erro (dia 4, 4 h)

**Hoje.** Sem Sentry, sem `error.tsx`, sem `not-found.tsx`, sem `global-error.tsx`. Erro em produção aparece em inglês e ninguém é avisado.

**Mudanças.**
1. `@sentry/nextjs` (plano gratuito cobre 5 mil eventos/mês): `src/instrumentation.ts` com `register()` e `onRequestError`, `sentry.client.config.ts` com amostragem 10% de traces, `sendDefaultPii: false`, `tunnelRoute: "/monitoramento"` (evita bloqueador de anúncios), e envs `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` na Vercel. Filtro `beforeSend` que remove `cpf`, `senha`, `token`, `codigo` de qualquer payload.
2. `src/app/global-error.tsx` (em português, com o botão "Tentar de novo" e o id do evento para a pessoa informar), `src/app/not-found.tsx` com a identidade visual e links para painel/portal, e `error.tsx` nos segmentos `painel`, `portal`, `hotel` (mantêm a sidebar/menu).
3. Alerta do Sentry por e-mail (e Telegram, via webhook, se quiser) para erro novo em produção.

**Verificação.** Rota de teste `/painel/ferramentas/anomalias?quebrar=1` só em preview lança erro: aparece a tela em português e o evento chega no Sentry sem CPF.

---

## 0+ — Opcionais ligados à pergunta sobre "sou humano" (dia 4, 4 h)

### 0+a — Turnstile dentro do Supabase Auth
- Ligar "Captcha protection" no dashboard do Supabase (provedor Cloudflare Turnstile, chave gratuita).
- Componente `<Turnstile>` nos formulários que chamam o Auth: `/login`, `/login/primeiro-acesso`, `/login/recuperar-senha`, `/portal` (senha e link), `/votar/[id]` (dois modos), `/portal/oposicao`, `/mesario`, `/apurador`, `/hotel`.
- As actions passam `options: { captchaToken }` em `signInWithPassword`, `signInWithOtp` e `verifyOtp`. Os fluxos via `admin.generateLink` (servidor) não precisam.
- Por que esse e não o "não sou um robô": é invisível (sem clique), gratuito e, principalmente, **validado pelo próprio GoTrue**, então protege a chamada direta à API, não só o formulário. Ver a avaliação abaixo.

### 0+b — Cadência de códigos por e-mail
- Tabela pequena `auth_codigos_envios (emp, email, enviado_em)`; regra: 1 código a cada 60 s e no máximo 5 por hora por e-mail, resposta genérica quando estourar.
- Fecha o abuso mais provável nos fluxos públicos: encher a caixa de uma vítima e queimar a cota do Brevo.

---

## Avaliação: login e senha na mesma tela, e "sou humano"

**Login em duas etapas (e-mail, depois senha) não traz segurança.** O Google e a Microsoft fazem isso para descobrir, pelo e-mail, para qual provedor de identidade mandar a pessoa (SSO), não para dificultar ataque. Para um robô ou uma IA, duas telas custam uma requisição a mais. E, se a primeira etapa reagir diferente para e-mail existente e inexistente, ela **piora** a enumeração de contas. Recomendação: manter uma tela só.

**O motivo central: a IA maliciosa não usa a tela.** Quem quer testar senhas chama o endpoint do Supabase Auth diretamente (`/auth/v1/token?grant_type=password`) com a anon key, que é pública por desenho. A forma do formulário é invisível para esse ataque. Por isso qualquer proteção tem de estar **no endpoint**, não no HTML.

**"Não sou um robô" (checkbox do reCAPTCHA v2).** O que ele faz: encarece automação em massa (credential stuffing, spam de códigos). O que ele não faz: parar um atacante dirigido. Serviços de resolução cobram centavos por mil desafios, e modelos multimodais resolvem a maioria. E o checkbox atrapalha o filiado, especialmente no celular. Em resumo: um pouco de proteção, com atrito real.

**Turnstile via Supabase é a versão que vale a pena.** Sem clique, gratuito, e a validação acontece dentro do GoTrue: sem o token, o próprio Supabase recusa `signInWithPassword`/`signInWithOtp`, mesmo quando a chamada vem de um script. Ele não substitui limite de tentativas, mas elimina o ataque barato.

**O que de fato segura o acesso, em ordem de efeito:**
1. **Limite de tentativas e bloqueio progressivo.** O Supabase já aplica por IP (30 chamadas de token a cada 5 min por IP; 30 e-mails/hora; 360 verificações/hora). Falta o bloqueio **por conta** (5 erros → 15 min), que o Supabase não faz; é uma tabela `login_tentativas` e 20 linhas na action (onda 1, S6).
2. **Proteção contra senha vazada** (HaveIBeenPwned), um botão no dashboard do Supabase; o `lint-seguranca.sql` já pede isso.
3. **2FA** para quem aprova pagamento, administra perfis e para o /admin (onda 1, S7).
4. **Zero enumeração** (S14) e aviso por e-mail "novo acesso de um aparelho diferente".
5. **Turnstile** (0+a) e **cadência de códigos** (0+b).

Conclusão prática: não mexer na tela; ligar o Turnstile no Supabase; e gastar o esforço em limite por conta, senha vazada e 2FA.

---

## Checklist de fechamento (dia 5)

- [ ] SQL de `auth_identidades`, `auth_vinculos_pendentes`, `portal_nao_filiado.auth_user_id` e trigger de `hora_voto` rodado em produção.
- [ ] `migrar-identidades-auth.mjs --dry-run` revisado; execução real; CSV das recusas entregue à secretaria.
- [ ] Teste de ataque do S1 repetido em produção.
- [ ] Teste de 10 votos simultâneos em assembleia de teste do tenant demo.
- [ ] `curl -I` dos cabeçalhos; nota em securityheaders.com.
- [ ] Sentry recebendo evento de teste sem dados pessoais.
- [ ] Senha do `fiscal@confluir.local` trocada.
- [ ] Manual: nota em "Acesso" sobre a vinculação de conta e o que fazer quando "a conta está vinculada a outro CPF".
- [ ] Memória atualizada: S1–S4 fechados; onda 1 começa por S6/S7/S9/S10.
