# 0012. Leituras grandes paginadas: teto de 1.000 linhas do PostgREST

- **Status:** aceita
- **Data:** 09/09/2026, com a segunda ocorrência em 01/10/2026 e a varredura completa em 16/10/2026.

- **Contexto:** o PostgREST corta toda resposta em 1.000 linhas, em silêncio, e `.limit(3000)` não fura esse teto. Uma importação de contribuições identificou 93 de 6.240 linhas. Listas de fornecedores paravam na letra "R".
- **Decisão:** qualquer `select` que possa passar de 1.000 linhas usa `lerEmLotes` (páginas de 1.000 com ordem estável terminando em `.order("id")`). Listas de ids usam `lerEmLotesPorIds` (fatias de 200 ids para não estourar a URL do `.in()`).
- **Consequências:**
  - Sem `.order("id")`, as páginas repetem ou pulam linhas.
  - O builder do supabase-js acumula `.order()`: monte a consulta do zero dentro do callback.
  - Diante de uma contagem estranha, a primeira pergunta é se a consulta pagina.
- **Onde está:** `src/lib/db/comum.ts` (`lerEmLotes`, `lerEmLotesPorIds`), `src/lib/db/fontes.ts` (`lerLotes`, alias).
