# supabase/

O schema do banco é versionado com a **CLI do Supabase** desde 18/10/2026 (Onda A do
`docs/plano-documentacao.md`).

| Pasta | O que é |
|---|---|
| `migrations/` | **A fonte da verdade.** `20261018000000_linha_de_base.sql` é o retrato de produção (gerado por `scripts/linha-de-base-schema.mjs`). Toda mudança depois dela é uma migração nova aqui. |
| `historico/` | Os ~220 SQLs soltos de antes da linha de base, rodados à mão no SQL Editor. **Já estão contidos na linha de base.** Ficam como registro do POR QUÊ de cada estrutura. Não rodar de novo e não acrescentar arquivos. |
| `seed/demo/` | Seeds do tenant de demonstração (prints do manual). Ver `seed/demo/LEIA-ME.md`. |
| `email-templates/` | Templates de e-mail do Auth (colados no painel). |
| `config.toml` | Configuração da CLI (`supabase init`). |

## Referências antigas

Comentários no código citam `supabase/<nome>.sql`. Esses arquivos estão hoje em
`supabase/historico/<nome>.sql` (ou `supabase/seed/demo/` para `demo-seed-*`). Os
nomes não mudaram, e o `git log --follow` preserva o histórico.

## Mudar o schema

```bash
npm run db:nova -- nome_da_mudanca      # cria migrations/<timestamp>_nome_da_mudanca.sql
npm run db:status                       # local × produção
npm run db:aplicar                      # aplica em produção as pendentes, em ordem; regrava impressão e dicionário
npm run db:dicionario                   # regera docs/dados/ (dicionário, ER, RLS, dados pessoais)
npm run db:deriva                       # o banco mudou fora das migrações?
npm run db:restaurar -- --seed          # reconstrói num projeto VAZIO (SUPABASE_DB_URL_RESTAURO) e compara com produção
```

**Restauração.** `db:restaurar` aplica `migrations/` num projeto Supabase
descartável e compara a impressão do resultado com a de produção. Ele recusa
rodar contra produção ou contra um banco que não esteja vazio. Com `--seed`,
esvazia o destino e roda as seeds do demo na ordem das dependências.
Ensaiado em 18/10/2026: schema **idêntico** (4.063 objetos) e 21/21 seeds.

**Deriva.** `schema-impressao.json` guarda a impressão digital do schema
(`public.schema_impressao()`: md5 de cada tabela, policy, índice, função, trigger…).
O `db:aplicar` regrava a impressão, e ela vai no mesmo commit da migração. O
`db:deriva` compara a impressão com o banco, e o cron `/api/schema/deriva/tick`
faz o mesmo toda segunda e avisa no Sentry. Uma diferença que não veio de
migração significa mudança pelo dashboard: transforme-a em migração.

Regras:
- Uma migração por mudança, **idempotente** (`if not exists`, `or replace`, `drop … if exists`), com o cabeçalho POR QUÊ / COMO que os arquivos de `historico/` já usam.
- **Nunca alterar o schema pelo dashboard ou pelo SQL Editor.** O que não passa por `migrations/` vira deriva e quebra a restauração.
- Migração aplicada não se edita. Corrige-se com uma migração nova.
- A migração roda em produção **antes** do commit do código que depende dela (regra da casa).
- Migrações de branches paralelos podem chegar fora de ordem (timestamp anterior à última aplicada). A CLI recusa com `MigrationMissingRemoteError`; confira que a migração não depende das posteriores e aplique com `npm run db:aplicar -- --include-all`.
- Os atalhos `db:*` leem `SUPABASE_DB_URL` do `.env.local` (URI do Session pooler) e nunca a imprimem.
