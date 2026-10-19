# 0023. Design system: tokens num só lugar e componentes padronizados

- **Status:** aceita
- **Data:** 17/07/2026, com ajustes em 28/07, 10/09 e 04/10/2026.

- **Contexto:** o app tinha cores cruas do Tailwind, três padrões de hub de módulo, grades diferentes por página e `confirm()` nativo. Isso gerava inconsistência visual e problemas de contraste.
- **Decisão:** a marca é o laranja `#FF5722` (ação) com o navy `#091747` (estrutura). `src/app/globals.css` é o único lugar com cor crua: paleta OKLCH → tokens semânticos light/dark → variáveis do shadcn. O tema usa next-themes com `data-theme`, e a fonte é Poppins. Os hubs usam `CartaoArea` + `GRADE_AREAS`. Confirmações usam `confirmar()` / `confirmarEnvio()` e erros por campo usam `ErroNoCampo`.
- **Consequências:**
  - Nada de cor crua fora de `globals.css`. Contraste AA é validado por script.
  - Dropdowns ficam em ordem alfabética.
  - O h1 e a metadata são iguais ao `titulo` em `MODULOS`.
  - Componentes novos entram via `npx shadcn add`.
  - Não rodar prettier com o padrão, porque o repositório não usa ponto e vírgula.
- **Onde está:** `src/app/globals.css`, `DESIGN.md`, `src/components/cartao-area.tsx` (`CartaoArea`, `GRADE_AREAS`), `src/components/ui/confirmacao.tsx`, `src/components/ui/erro-no-campo.tsx`, rota `/style-guide`.
