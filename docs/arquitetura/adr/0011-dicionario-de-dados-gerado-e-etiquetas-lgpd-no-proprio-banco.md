# 0011. Dicionário de dados gerado e etiquetas `[lgpd:]` no próprio banco

- **Status:** aceita
- **Data:** 18/10/2026.

- **Contexto:** filiação sindical é dado sensível (art. 5º II da LGPD), então a base inteira é sensível. Sem saber onde está cada dado pessoal, não há ROPA, retenção nem atendimento ao titular.
- **Decisão:** toda tabela e coluna leva um `comment on` com a etiqueta `[lgpd:cats|titulares:x]`. O dicionário (`docs/dados/`) e o ROPA (`docs/lgpd/ropa.md`) são gerados a partir do banco e de `docs/lgpd/processos.mjs`, e o `db:aplicar` os regera.
- **Consequências:**
  - Tabela ou coluna nova sem etiqueta, ou sem processo no ROPA, é acusada pela geração.
  - Integração nova que receba dado pessoal entra em `docs/lgpd/suboperadores.md` e em `SUBOPERADORES` antes de ir ao ar.
  - O dicionário vai no mesmo commit da migração.
- **Onde está:** `scripts/gerar-dicionario.mjs` (`npm run db:dicionario`), `scripts/gerar-ropa.mjs` (`npm run lgpd:ropa`), `docs/dados/`, `docs/lgpd/`, `supabase/migrations/20261018153132_comentarios_lgpd.sql`.
