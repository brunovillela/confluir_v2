# 0014. Data e hora sempre em America/Sao_Paulo nas duas pontas

- **Status:** aceita
- **Data:** 06/09/2026, com os pontos restantes corrigidos em 03/10/2026.

- **Contexto:** `<input type="datetime-local">` devolve hora sem fuso. O navegador interpreta em BRT e o servidor da Vercel em UTC, então a hora andava 3 h para trás a cada vez que se salvava. Em teste local o problema não aparece.
- **Decisão:** a conversão de campo é sempre `paraCampoDataHora()` / `deCampoDataHora()`, que fixam `America/Sao_Paulo` com o deslocamento calculado por `Intl` (não fixo em -03:00). Nunca `new Date(texto)` no servidor. Datas de calendário também são derivadas em SP.
- **Consequências:**
  - Toda tela nova com `datetime-local` deve ser conferida com `grep -rn 'datetime-local' src`.
  - Dados gravados antes da correção seguem deslocados.
  - A migração do Bubble usa a parte UTC das datas (convenção de junho), e 2.187 datas não foram mexidas.
- **Onde está:** `src/lib/formato.ts` (`paraCampoDataHora`, `deCampoDataHora`).
