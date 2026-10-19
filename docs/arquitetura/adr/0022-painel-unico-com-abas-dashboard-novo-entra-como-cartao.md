# 0022. Painel único com abas: dashboard novo entra como cartão

- **Status:** aceita
- **Data:** 06/10/2026, com a fonte única de contadores em 09/10/2026.

- **Contexto:** painel, home do diretor, área do coordenador e indicadores eram páginas separadas, com contadores que divergiam entre si.
- **Decisão:** `/painel` é um hub com abas (Meu dia, Diretor, Coordenação, Indicadores; `?aba=` e cookie `painel_aba`), com a caixa de entrada no topo e só a aba ativa renderizada, em Suspense. As rotas antigas apenas redirecionam.
- **Consequências:**
  - Bloco novo de dashboard entra como cartão numa aba existente, não como página nova.
  - As pendências vêm do `ContadoresProvider`.
  - O visual HUD usa classes de `globals.css`.
- **Onde está:** `src/app/painel/page.tsx`, `src/app/painel/_painel/`, `src/components/painel/`, `src/components/layout/contadores-header.tsx`.
