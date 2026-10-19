# 0013. Auditoria de escrita por trigger, com o autor carimbado pelo cliente

- **Status:** aceita
- **Data:** 03/10/2026.

- **Contexto:** era preciso saber quem alterou o quê sem depender de cada action lembrar de registrar. As escritas passam por dois papéis (tenant e service role), então `auth.uid()` não identifica a pessoa.
- **Decisão:** o trigger `registrar_auditoria()` (AFTER INSERT/UPDATE/DELETE) grava em `auditoria` os campos `antes`, `depois`, `campos` e `usuario_id`. O autor vem do cabeçalho `x-confluir-usuario`, que `createAdminClient()` injeta nos dois clientes. A consulta fica em /painel/institucional/auditoria, com a permissão `institucional_auditoria`.
- **Consequências:**
  - Tabela sensível nova ganha o trigger na migração (hoje são 39).
  - Escritas por script ou service role sem o cabeçalho ficam sem autor.
  - Só registra escrita, não leitura (lacuna B8, por exemplo leitura de CAT).
  - A auditoria copia tokens e códigos em claro (achado aberto).
- **Onde está:** `supabase/migrations/20261018000000_linha_de_base.sql` (`registrar_auditoria`, tabela `auditoria`), `src/lib/sessao-atual.ts` (`usuarioIdAtual`), `src/lib/supabase/admin.ts`, `src/lib/db/auditoria.ts`.
