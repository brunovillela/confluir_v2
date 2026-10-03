# Plano da Onda 1 — proteção estrutural

Continuação da onda 0 (`docs/plano-onda-0-seguranca.md`). Itens S6, S7, S9, S10, S11, S12, S16, E2, E3, E4, E5 e U7 da avaliação de 03/10. Caminhos relativos a `confluir/`. Estimativa: **5 dias úteis**, deploy ao fim de cada dia, SQL sempre antes do push que depende dele.

## Ordem de execução

| Dia | Itens | O que entrega |
|---|---|---|
| 1 | U7, S12, S6, E3, E4, E5 | Fuso certo nos 4 pontos; token de descadastro sem CPF e com chave própria; bloqueio progressivo por conta no login; CI (tsc + lint + build); Dependabot e `npm audit`; checagem de backup documentada. |
| 2 | S7 | 2FA (TOTP) do Supabase: cadastro em Meu perfil, desafio após a senha, obrigatório para /admin, alçada, pagamento e gestão de usuários; reset pela gestão. |
| 3 | S9 | Trilha de auditoria genérica por trigger nas tabelas sensíveis, com o usuário que agiu no JWT do tenant; tela "Auditoria" no Institucional. |
| 4 | S10, S11 | Service role só na plataforma e nos crons (lint que falha o build); `receberArquivo()` com magic bytes em todos os uploads. |
| 5 | S16, E2 | Anonimização executável, exportação dos próprios dados no portal, consentimento versionado com IP; smoke E2E dos 20 fluxos críticos entrando por link mágico (o captcha não barra `verifyOtp`). |

## Andamento

- **Dia 3 — CÓDIGO PRONTO em 03/10/2026 (noite), aguardando o SQL.** S9: `supabase/auditoria.sql` (tabela `auditoria`, função `registrar_auditoria()` security definer que grava só os campos alterados, oculta colunas sigilosas, ignora carimbos e nunca derruba a operação; trigger instalado nas 18 tabelas sensíveis que existirem; permissão `institucional_auditoria`). O "quem" vai no cabeçalho `x-confluir-usuario`, carimbado pelo `createAdminClient()` nos dois clientes (`lib/sessao-atual.ts`, cacheado por requisição) e lido pelo trigger em `request.headers`. Tela `/painel/institucional/auditoria` (filtros por tabela, pessoa, registro e período; antes × depois por campo; link para o histórico do registro), cartão no hub, artigo do manual. Verificado no demo local: a tela abre e avisa que a trilha não está instalada. **Para o usuário:** rodar `supabase/auditoria.sql` (e `login-tentativas.sql` do dia 1, se ainda não rodou); depois eu testo o trigger de ponta a ponta.
- **Dia 2 — FEITO em 03/10/2026 (noite).** S7: TOTP do Supabase. `lib/mfa.ts` (regras), `/conta/seguranca` (cadastro com QR e chave, confirmação, desativação só com sessão elevada), `/login/verificacao` (desafio; falhas contam no bloqueio progressivo com a chave `mfa:<conta>`), proxy manda sessão `aal1` de conta com fator para o desafio em `/painel` e `/admin`, `requireSessaoPainel` repete a checagem, login por senha redireciona ao desafio, cartão "Verificação em duas etapas" na ficha do usuário com **Redefinir** pela gestão (`lib/db/acessos-mfa.ts`), item "Segurança da conta" em Meu perfil, artigo do manual em Introdução. Obrigatoriedade por permissão sensível atrás de `MFA_OBRIGATORIO=1` (desligada por padrão). **Verificado no demo local:** cadastro com código TOTP calculado da chave, página "ativa", nova sessão por link mágico barrada em `/login/verificacao`, código errado recusado, código certo abriu o painel, redefinição pela ficha deixou a conta "Não cadastrada" (0 fatores no Supabase). **Para o usuário:** cadastrar o seu próprio 2FA em Meu perfil → Segurança da conta; quando a equipe sensível tiver cadastrado, ligar `MFA_OBRIGATORIO=1` na Vercel.
- **Dia 1 — FEITO em 03/10/2026 (noite).** U7: `deCampoDataHora` nos quatro pontos; verificado no demo local — bloqueio criado às 10:00 de Macaé gravou `2026-11-20T13:00:00Z`. S12: token de descadastro leva o id do cadastro (`comunicacao_envios.filiacao_id`), chave derivada por finalidade; envio antigo sem `filiacao_id` sai sem link de descadastro em vez de expor o CPF. S6: `lib/login-bloqueio.ts` + `supabase/login-tentativas.sql` nos quatro pontos de senha (painel, portal, hotel, reversão coletiva); tolerante à tabela ausente. E3: `.github/workflows/ci.yml` (tsc, eslint, `npm audit --omit=dev --audit-level=high`, build se os segredos públicos existirem). E4: `.github/dependabot.yml`; `npm audit` apontou o **Next 16.2.10 com CVEs críticas** (bypass do proxy, RCE no otimizador de imagens) → atualizado para **16.3.8** e `shadcn` movido para devDependencies; audit de produção zerado; `tsc` e `next build` limpos. **Para o usuário:** rodar `supabase/login-tentativas.sql`; cadastrar em GitHub → Settings → Secrets and variables → Actions os três `NEXT_PUBLIC_*` do Supabase (URL, anon key, EMP_PROPRIETARIA_ID) se quiser o build no CI; E5: conferir no Supabase (Database → Backups) se o PITR está ligado.

## Detalhes por item

### U7 — fuso nos quatro pontos (dia 1)
`new Date("AAAA-MM-DDTHH:mm")` no servidor lê como UTC (3 h de erro). Trocar por `deCampoDataHora` (`lib/formato.ts`), que já é usado em eventos e agenda:
- `app/painel/representacao/votacoes/urnas/[id]/actions.ts` (`dataHora`)
- `lib/db/espacos-solicitacao.ts` (`registrarPedido`: início, término, montagem, desmontagem e a checagem "já passou")
- `lib/db/espacos-esteira.ts` (`agendarVisita`)
- `lib/db/espacos.ts` (`criarBloqueio`: hoje grava o texto cru)

### S12 — token de descadastro (dia 1)
O token levava o CPF legível em base64url na URL e no header List-Unsubscribe. Passa a levar o id do cadastro, com a chave derivada por finalidade (`sha256("descadastro:" + SUPABASE_JWT_SECRET)`), sem variável nova. Links antigos deixam de valer — a mala direta gera link novo a cada envio.

### S6 — bloqueio progressivo por conta (dia 1)
Tabela `login_tentativas` (`supabase/login-tentativas.sql`): por tenant e identificador (`senha:<e-mail>`), falhas seguidas e `bloqueado_ate`. 5 falhas → 15 min; 10 → 1 h. Aplicado em login do painel, do portal (CPF + senha), do hotel e na reautenticação da reversão coletiva. Sucesso zera. Tolerante à tabela ausente. Mensagem genérica, sem dizer se a conta existe.

### E3 / E4 / E5 (dia 1)
`.github/workflows/ci.yml`: `npm ci`, `tsc --noEmit`, `eslint`, `next build` (o build só roda se os segredos públicos do Supabase estiverem no repositório). `.github/dependabot.yml` semanal para npm. Backup: confirmar no dashboard do Supabase (Database → Backups) que o PITR está ligado e anotar aqui a data de um teste de restauração.

### S7 — 2FA (dia 2)
Supabase MFA TOTP. Páginas: `/painel/perfil/seguranca` (cadastrar: QR + código; remover), `/login/verificacao` (desafio após a senha; o proxy manda para lá quem tem fator e sessão `aal1`). Obrigatório para `plataforma_admins`, `financeiro_pagamento`, alçada e `institucional_usuarios`: sem fator cadastrado, o painel abre só a página de cadastro. Gestão de usuários ganha "Redefinir 2FA" (apaga os fatores via admin API). Portal e hotel ficam opcionais.

### S9 — trilha de auditoria (dia 3)
Tabela `auditoria` (tabela, registro, operação, antes, depois, usuário, momento) + função de trigger genérica, instalada nas tabelas sensíveis (permissoes, perfis, perfil_permissoes, usuario_perfis, usuarios, filiacoes, dados_bancarios, fornecedores, auth_identidades, ordens_pagamento, contratos). O usuário que agiu vai na claim `usuario_id` do JWT do tenant (`createAdminClient`). Tela `/painel/institucional/auditoria` com filtros, permissão própria.

### S10 / S11 (dia 4)
Trocar `createServiceClient` por `createAdminClient` nas 26 libs de tenant; regra do ESLint (`no-restricted-imports`) que só permite o service client em `lib/plataforma*`, `lib/db/plataforma.ts`, `proxy.ts` e nos ticks. `lib/uploads.ts` com `receberArquivo({ arquivo, tipos, maximoBytes })` conferindo magic bytes (PDF, JPEG, PNG, WebP, XLSX/DOCX) e normalizando o `contentType`; aplicado nos 46 pontos, começando pelos públicos.

### S16 / E2 (dia 5)
Anonimização: função SQL `anonimizar_filiacao(id)` + ação na ficha, só para quem tem a permissão de LGPD; exportação "Meus dados" (JSON e PDF) no portal; `filiacao_tl_lgpd_aceites` com versão do termo, IP e user-agent. E2E: `tests/e2e/*.spec.ts` com Playwright contra o tenant demo, login por `generateLink` + `/auth/confirm`; 20 fluxos; roda no CI quando os segredos existirem.
