# 0009. Tarefas agendadas como Vercel Cron em `/api/**/tick`

- **Status:** aceita
- **Data:** padrão consolidado em 03–04/10/2026, com crons anteriores (comunicação, filiação coletiva).

- **Contexto:** lembretes, vencimentos, analítica, cobranças, retenção LGPD, votação e conferência de deriva do schema precisam rodar sem usuário. Essas rotinas atravessam tenants.
- **Decisão:** cada rotina é uma rota `src/app/api/<area>/tick/route.ts` agendada em `vercel.json`. A rota é protegida por `CRON_SECRET` (`x-cron-secret` ou `Authorization: Bearer`). Ela é um dos poucos lugares em que o service role é permitido, e passa um ambiente com tenant explícito às funções de domínio.
- **Consequências:**
  - O lint proíbe `createServiceClient` fora da allowlist. A rota cria o cliente e o repassa.
  - Os ticks precisam ser idempotentes.
  - Erros do tick de deriva vão para o Sentry.
- **Onde está:** `vercel.json` (`crons`), `src/app/api/*/tick/route.ts` (14 rotas com `CRON_SECRET`), `eslint.config.mjs`.
