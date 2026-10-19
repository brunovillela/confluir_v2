# 0016. O código tolera schema ausente (`esquemaAusente`)

- **Status:** aceita
- **Data:** padrão desde 07/2026.

- **Contexto:** durante meses, o SQL era escrito pelo agente e rodado depois pelo usuário. Um deploy com o código novo não podia quebrar a tela enquanto a coluna ou a tabela ainda não existisse.
- **Decisão:** leituras de recurso novo testavam `esquemaAusente(erro)` (PGRST205/42P01/42703) e degradavam: a parte some, ou a função volta ao comportamento antigo, em vez de lançar erro. **Desde 18/10/2026 (ADR 0010), o padrão é legado:** a migração roda antes do commit, então código novo não precisa usá-lo. Os usos existentes ficam como rede de segurança.
- **Consequências:**
  - A degradação é limpa, mas pode esconder um SQL que nunca rodou.
  - Com a regra de migração antes do commit (0010), o padrão vira uma rede de segurança, não um fluxo.
  - `lerEmLotes` preserva o `code` do erro para esse teste funcionar.
- **Onde está:** `esquemaAusente` em 113 arquivos de `src/`, `src/lib/db/comum.ts`.
