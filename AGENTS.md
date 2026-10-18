<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Banco de dados: só por migração

O schema é versionado com a CLI do Supabase (ver `supabase/LEIA-ME.md`).

- SQL novo = `npm run db:nova -- <nome>` → arquivo em `supabase/migrations/`. **Nunca** criar `.sql` solto em `supabase/` nem em `supabase/historico/` (arquivo morto, já contido na linha de base).
- Migração idempotente, com cabeçalho POR QUÊ / COMO; migração aplicada não se edita (corrige-se com outra).
- Aplicar em produção com `npm run db:aplicar` (pede confirmação; precisa da autorização do usuário), **antes** de commitar o código que depende dela. Conferir com `npm run db:status`. O `db:aplicar` regrava `supabase/schema-impressao.json` e o dicionário `docs/dados/`, que vão no mesmo commit da migração (tabela/coluna nova leva `comment on` com etiqueta `[lgpd:…]`, ver `docs/dados/LEIA-ME.md`); `npm run db:deriva` acusa mudança fora das migrações.
- Nada de schema pelo dashboard ou SQL Editor: vira deriva e quebra a restauração.
- `SUPABASE_DB_URL` (no `.env.local`) nunca é impressa nem colada em comandos visíveis; os scripts `db.mjs` e `linha-de-base-schema.mjs` a leem sozinhos.
- Comentários antigos que citam `supabase/<nome>.sql` apontam para `supabase/historico/<nome>.sql` (seeds do demo: `supabase/seed/demo/`).
