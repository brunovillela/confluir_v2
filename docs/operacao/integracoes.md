# Integrações: credenciais e o que fazer quando caem

> **Onda E**, 19/10/2026. Inventário operacional dos serviços externos. O olhar de proteção de dados (o que cada um recebe, DPA, transferência internacional) está em [`docs/lgpd/suboperadores.md`](../lgpd/suboperadores.md). "Dono" é a conta que administra o serviço; preencher quem é o responsável humano de cada uma.

## Variáveis de ambiente

Ficam na Vercel (Production e Preview) e no `.env.local`. **Nunca** no repositório. Depois de trocar uma variável, é preciso redeploy.

| Variável | Serviço | Sem ela… | Pública? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | o app não sobe | sim (vai ao navegador) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | proxy, crons, plataforma e API param | **não** (ignora o RLS) |
| `SUPABASE_JWT_SECRET` | Supabase / assinaturas internas | sem JWT do tenant e sem assinatura do tenant e dos links | **não** |
| `SUPABASE_DB_URL` | Postgres (só desenvolvimento e scripts) | `db:*`, `votacao:auditar` e dicionário não rodam | **não**, só no `.env.local` |
| `SUPABASE_DB_URL_RESTAURO` | Projeto descartável para ensaio | `db:restaurar` não roda | **não**; apagar depois do ensaio |
| `NEXT_PUBLIC_EMP_PROPRIETARIA_ID` | Tenant padrão (sem subdomínio) | localhost e apex sem tenant | sim |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_DOMAIN` | Domínio | links de e-mail errados | sim |
| `CRON_SECRET` | Crons | todo tick responde 401 | **não** |
| `OPENAI_API_KEY`, `MODELO_IA` | OpenAI | recursos de IA mostram "IA não configurada"; o resto funciona | **não** |
| `BREVO_API_KEY` / `RESEND_API_KEY`, `EMAIL_PROVEDOR`, `EMAIL_REMETENTE`, `EMAIL_SANDBOX` | E-mail | `enviarEmail` devolve falso: códigos, convites e avisos **não chegam** | **não** |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | Telegram | bot e avisos pelo Telegram ficam inertes | **não** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare | formulários **sem** proteção anti-robô (passa direto) | site key sim |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push | notificações no celular ficam inertes | pública sim |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Sentry | erros e alertas de deriva **não são vistos** | DSN público sim |
| `SAUDE_RELATORIO_CHAVE` | Cifragem de saúde | relatório clínico não grava nem abre; anonimização com acervo de saúde é recusada | **não**; **guardar cópia segura**: perder = perder os relatórios |
| `MFA_OBRIGATORIO` | Segundo fator | MFA fica opcional para funções sensíveis | — |
| `BUBBLE_API_ROOT`, `BUBBLE_API_TOKEN` | Bubble (só scripts de migração) | scripts de delta não rodam | **não** |

## Serviços

| Serviço | Para quê | Dono (conta) | Quando cai | O que fazer |
|---|---|---|---|---|
| **Supabase** (sa-east-1) | Banco, Auth, Storage | _preencher_ | Tudo para | status.supabase.com; acompanhar; se for perda de dados, ver [`continuidade.md`](continuidade.md) |
| **Vercel** (Pro, gru1) | Aplicação, crons, DNS | _preencher_ | Site fora | vercel-status.com; se o problema for do deploy, rollback (runbook R2) |
| **GitHub** | Código e CI | _preencher_ | Sem deploy novo | O site no ar continua; esperar |
| **Brevo** (e-mail do app) | Códigos, convites, avisos, comprovantes | _preencher_ | Códigos de votação e de acesso não chegam | Trocar para Resend: `EMAIL_PROVEDOR=resend` + redeploy (`docs/email-resend.md`) |
| **Resend** (SMTP do Auth, reserva) | E-mails nativos do Supabase Auth | _preencher_ | Só afeta o canal de reserva | O app envia convites e códigos pelo canal próprio (ADR 0007) |
| **OpenAI** | Leitura de PDF/imagem, redação | _preencher_ | Botões de IA falham com mensagem | Digitação manual continua; conferir saldo, cota e chave |
| **Telegram** | Bot de avisos, aprovações e votação | _preencher_ (BotFather) | Avisos pelo Telegram param | Os outros canais seguem; reconfigurar o webhook (`docs/telegram-deploy.md`) |
| **Cloudflare Turnstile** | Anti-robô | _preencher_ | O widget falha e o formulário **passa** (falha aberta) | Monitorar abuso (bloqueio de login, cadência de códigos) |
| **Sentry** (UE) | Erros e alertas | _preencher_ | Ficamos cegos para erros | Acompanhar pelos logs da Vercel |
| **Bubble** (legado) | Hospedagem/portal/anuênio antigos; histórico | _preencher_ | Scripts de delta falham | Decidir o desligamento (`suboperadores.md`) |
| **Bancos (CNAB)** | Remessas e retornos | Entidade | Pagamentos não saem | Arquivos ficam no sistema; reenviar depois |

## Checklist de troca de fornecedor

1. Registrar a decisão numa ADR nova, se mudar uma decisão existente (ex.: ADR 0006 para IA, 0007 para e-mail).
2. Atualizar `docs/lgpd/suboperadores.md` e `SUBOPERADORES` em `docs/lgpd/processos.mjs`; avisar as entidades com 30 dias de antecedência (contrato de operação, cl. 6.2).
3. Atualizar esta tabela e as variáveis na Vercel.
