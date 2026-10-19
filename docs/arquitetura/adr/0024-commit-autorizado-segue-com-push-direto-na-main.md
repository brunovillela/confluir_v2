# 0024. Commit autorizado segue com push direto na main

- **Status:** aceita
- **Data:** 10/10/2026, como prática consolidada desde o primeiro deploy.

- **Contexto:** o deploy de produção na Vercel sai da `main`. Não há branches de feature nem PR no fluxo normal. Várias sessões de trabalho podem estar abertas ao mesmo tempo no mesmo repositório.
- **Decisão:** um commit autorizado pelo usuário é seguido de push para `origin main` na mesma etapa, e o relato diz isso. A migração SQL nova é aplicada antes do commit do código que depende dela. Commite só o que é da sessão, com `git commit --only`, mas confira as dependências para não quebrar o build.
- **Consequências:**
  - Cada push é um deploy de produção.
  - O CI (lint, typecheck) e o Dependabot são a rede.
  - Commit parcial já quebrou o build uma vez.
  - Trabalho paralelo usa worktrees, integrados por merge na main.
  - A cada deploy com mudança visível, acrescentar uma entrada em `lib/novidades.ts`.
- **Onde está:** `AGENTS.md` (ordem migração → commit), `src/lib/novidades.ts`, CI do GitHub.
