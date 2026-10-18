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
npm run db:aplicar                      # aplica em produção as pendentes, em ordem
```

Regras:
- Uma migração por mudança, **idempotente** (`if not exists`, `or replace`, `drop … if exists`), com o cabeçalho POR QUÊ / COMO que os arquivos de `historico/` já usam.
- **Nunca alterar o schema pelo dashboard ou pelo SQL Editor.** O que não passa por `migrations/` vira deriva e quebra a restauração.
- Migração aplicada não se edita. Corrige-se com uma migração nova.
- A migração roda em produção **antes** do commit do código que depende dela (regra da casa).
- Os atalhos `db:*` leem `SUPABASE_DB_URL` do `.env.local` (URI do Session pooler) e nunca a imprimem.
