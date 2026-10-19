# 0010. Schema só por migração, com a CLI do Supabase, impressão digital e deriva

- **Status:** aceita
- **Data:** 18/10/2026.

- **Contexto:** 114 das 318 tabelas usadas pelo código não eram criadas por nenhum SQL do repositório, porque o núcleo nasceu no dashboard durante a migração do Bubble. Os SQLs avulsos (221) eram rodados à mão. O banco não era reconstruível a partir do repositório.
- **Decisão:** a linha de base é um dump schema-only (`20261018000000_linha_de_base.sql`). Toda mudança é uma migração criada com `npm run db:nova`, idempotente, com cabeçalho POR QUÊ / COMO, aplicada com `npm run db:aplicar`. Esses scripts envolvem `supabase migration new/up --db-url`. `public.schema_impressao()` gera uma impressão digital (`supabase/schema-impressao.json`), e `npm run db:deriva` e um cron semanal acusam mudança feita fora das migrações. `npm run db:restaurar` reconstrói um banco vazio de forma idêntica.
- **Consequências:**
  - Nada de schema pelo dashboard ou pelo SQL Editor. Migração aplicada não se edita: corrige-se com outra.
  - A migração é aplicada em produção antes do commit do código que depende dela.
  - `supabase/historico/` é arquivo morto. Comentários antigos que citam `supabase/x.sql` apontam para lá.
  - Os privilégios revogados à mão não vinham no dump, o que motivou a migração `privilegios_exatos`.
  - `SUPABASE_DB_URL` nunca é impressa.
- **Onde está:** `supabase/migrations/` (11 migrações), `scripts/db.mjs`, `scripts/linha-de-base-schema.mjs`, `scripts/restaurar.mjs`, `supabase/LEIA-ME.md`, `AGENTS.md`, `src/app/api/schema/deriva/tick/route.ts`.
