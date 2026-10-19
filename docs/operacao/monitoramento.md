# Monitoramento e alertas

> **Onda E**, 19/10/2026. O que vigiar, onde e com que frequência. Hoje a vigilância é quase toda **passiva** (Sentry e logs); a seção 3 lista o que falta ligar.

## 1. Sinais automáticos que já existem

| Sinal | Onde chega | O que significa | Primeira ação |
|---|---|---|---|
| Erro de servidor ou navegador | Sentry (projeto do Confluir) | Exceção não tratada (dados sensíveis filtrados) | Abrir o evento; se afeta muitos, rollback (R2) |
| **Deriva do schema** (segunda 10:00 UTC) | Sentry, aviso "Deriva do schema" | Alguém mudou o banco fora das migrações | `npm run db:deriva`; transformar em migração ou desfazer |
| Relatório de CSP | Sentry (`/api/csp-relatorio`) | Script ou recurso bloqueado pela política | Ver se é ataque ou recurso legítimo novo |
| CI vermelho | GitHub (e-mail do GitHub) | Tipos, lint ou build quebrados na `main` | Corrigir antes do próximo push; conferir se o deploy da Vercel também falhou |
| Deploy falho | Vercel (e-mail) | Build quebrou; produção segue no deploy anterior | Corrigir e fazer novo push |
| Dependências vulneráveis | Dependabot (PRs no GitHub) | Biblioteca com falha conhecida | Revisar e integrar |

## 2. Conferências periódicas (manuais por enquanto)

| Frequência | O que | Como |
|---|---|---|
| Semanal | Erros novos no Sentry | Painel do Sentry |
| Semanal | Crons rodando | Vercel → Crons (último status de cada um dos 14) |
| Semanal | Exportações e uso da API fora do padrão | Institucional › Auditoria › Exportações / API |
| Mensal (dia 2) | Resultado do motor de retenção | Institucional › LGPD (simulações e execuções) |
| A cada votação encerrada | Conferência C1–C5 | `npm run votacao:auditar -- --rodada=<id>` |
| A cada migração | Deriva | `npm run db:deriva` |
| Trimestral | Ensaio de restauração | [`continuidade.md`](continuidade.md) |
| Trimestral | Revisão de acessos | Super-admins (`/admin`), perfis com `concede_tudo`, chaves da API ativas |

## 3. O que falta ligar

| # | Lacuna | Proposta |
|---|---|---|
| M-1 | Sem alerta de **cron que parou** (um tick que falha ou não roda passa despercebido) | Cada tick grava "última execução ok" numa tabela; um painel de plataforma mostra o atraso, e o tick de deriva avisa no Sentry se algum passar do prazo |
| M-2 | Sem monitor externo de disponibilidade | Monitor de uptime gratuito (ex.: verificação de `/login` a cada 5 min) com aviso por e-mail ou Telegram ao responsável |
| M-3 | Regras de alerta do Sentry não documentadas | Configurar no Sentry: aviso imediato para eventos "Deriva do schema" e para picos de erro; registrar aqui o destinatário |
| M-4 | Sem aviso de falha de **e-mail** em massa (Brevo fora = códigos de votação não chegam) | Contar falhas de `enviarEmail` por hora; acima do limiar, aviso no Sentry |
| M-5 | Sem verificação de que MFA e Turnstile estão ligados em produção | O tick de deriva confere `MFA_OBRIGATORIO` e `TURNSTILE_SECRET_KEY` e avisa se estiverem desligados (risco M7 da RIPD multi-entidade) |
| M-6 | Logs da Vercel com retenção curta | Avaliar log drain para guardar o suficiente para investigar um incidente |
