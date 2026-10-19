# 0020. Padrão de 3 níveis nas áreas do Pessoal

- **Status:** aceita
- **Data:** 16/10/2026 (fases 0 a 5 concluídas em 16–17/10).

- **Contexto:** cada área do Pessoal (ponto, contracheques, férias, carreira, informes, diárias, reembolsos, SST e outras) tinha uma navegação própria. Era difícil ver um funcionário através das áreas.
- **Decisão:** toda área segue 3 níveis. (1) A área tem indicadores e a lista de funcionários com filtros, ordenação e paginação, que é a aba inicial; a visão própria da área, como Remessas, vira aba. (2) `<area>/funcionario/[usuarioId]` mostra o funcionário na área, com indicadores e histórico. (3) `<area>/funcionario/[usuarioId]/[registroId]` mostra o registro, com voltar e anterior/próximo (`?de=remessa`). Atestados, Ausências e ASO ficam separados, com links cruzados. Carreira é modular por tenant.
- **Consequências:**
  - Área nova reaproveita os componentes de `components/pessoal/` e `lib/pessoal-area.ts`.
  - "Voltar à lista" preserva o filtro (chave `<area>-funcionarios`).
  - O cabeçalho do funcionário é padronizado no nível 3.
- **Onde está:** `src/lib/pessoal-area.ts`, `src/lib/db/pessoal-area.ts`, `src/components/pessoal/` (`abas-link`, `filtros-funcionarios`, `tabela-funcionarios`, `cabecalho-funcionario`, `navegacao-registro`), `src/app/painel/pessoal/<area>/funcionario/`.
