# Runbooks de operação

> **Onda E** (`docs/plano-documentacao.md`), 19/10/2026. Passo a passo das operações rotineiras e de emergência. Incidentes de segurança: [`docs/lgpd/incidentes.md`](../lgpd/incidentes.md). Decisões de arquitetura: [`docs/arquitetura/`](../arquitetura/LEIA-ME.md).

## Ambiente

| Peça | Onde | Observação |
|---|---|---|
| Código | GitHub `brunovillela/confluir_v2`, branch `main` | Cada push na `main` é um deploy de produção (ADR 0024) |
| CI | `.github/workflows/ci.yml` | Tipos, lint e build a cada push e PR; Dependabot ativo |
| Aplicação | Vercel, projeto `confluir_v2`, plano **Pro** (desde 30/09/2026) | Funções em **`gru1`** (São Paulo), configurado **só no painel** da Vercel (ADR 0004) |
| Domínio | `confluir.online` com nameservers na Vercel | Wildcard `*.confluir.online` com SSL automático; apex e `www` mostram a landing |
| Banco | Supabase, região `sa-east-1` | Schema só por migração (ADR 0010) |
| Segredos | Vercel → Settings → Environment Variables; `.env.local` na máquina de desenvolvimento | Nunca no repositório (`.env*` no `.gitignore`) |

## R1. Publicar uma mudança (deploy normal)

1. Se houver mudança de banco: `npm run db:nova -- <nome>`, escrever a migração, testar em transação e `npm run db:aplicar`. O `db:aplicar` regrava a impressão, o dicionário e o ROPA.
2. `npx tsc --noEmit -p .` e `npx eslint <arquivos>`; para mudança grande, `npm run build`.
3. Testar no demo: preview `confluir-demo` (porta 3222, tenant de demonstração).
4. `git commit --only <arquivos da mudança>` (nunca arquivos de outra sessão) e `git push`.
5. Acompanhar o deploy na Vercel e o CI no GitHub. Se a mudança for visível ao usuário, acrescentar uma entrada em `src/lib/novidades.ts`.

## R2. Desfazer um deploy (rollback)

1. **Aplicação:** Vercel → Deployments → escolher o último deploy bom → **Instant Rollback** (ou "Promote to Production"). Leva segundos e não refaz o build.
2. **Banco:** migração não se desfaz sozinha. Se a versão anterior do código não funciona com o schema novo, escrever uma migração **reversa** (nova, nunca editar a aplicada) e aplicá-la. Por isso as migrações devem ser **aditivas** sempre que possível: coluna nova opcional, tabela nova; remover só depois, em outra migração.
3. Corrigir na `main` (revert ou correção) e fazer push: o próximo deploy substitui o rollback.

## R3. Aplicar uma migração

```bash
npm run db:status
```
```bash
npm run db:aplicar
```
- Pede confirmação ("sim") e regrava `supabase/schema-impressao.json`, `docs/dados/` e `docs/lgpd/ropa.md`: commitar tudo junto com a migração.
- Migração de branch paralelo com horário anterior à última aplicada: `npm run db:aplicar -- --include-all` (conferir antes que ela não depende das posteriores).
- Depois: `npm run db:deriva` deve dizer "Sem deriva".
- Se o `npm run db:nova` deixar o `supabase.exe` pendurado depois de criar o arquivo, encerrar o processo (o arquivo já foi criado).

## R4. Criar uma entidade (tenant)

1. `/admin` (só super-admins, com MFA) → novo tenant: slug (vira o subdomínio), razão social, CNPJ e o primeiro administrador.
2. O primeiro administrador recebe o convite por e-mail e define a senha.
3. Na entidade, ele preenche **Institucional › Organização**: dados, sedes, logo e o **encarregado (LGPD)**, que aparece em `/privacidade`.
4. Conferir: `https://<slug>.confluir.online/login` abre com a marca da entidade; `/privacidade` mostra os dados certos.
5. Assinar com a entidade o contrato de operação (`docs/lgpd/contrato-operacao.md`).

## R5. Suspender ou reativar uma entidade

`/admin` → tenant → status `suspenso` (ou `ativo`). O subdomínio passa a mostrar "Organização suspensa" em **até 60 s** (cache do proxy por instância). Os dados não são apagados. Para encerrar de vez, seguir a cláusula 10 do contrato de operação (exportação por 30 dias, depois eliminação).

## R6. Rodar um cron fora de hora

```bash
curl -H "x-cron-secret: $CRON_SECRET" https://confluir.online/api/<area>/tick
```
Os ticks são idempotentes (ADR 0009). Para o motor de retenção (`/api/lgpd/retencao/tick`), lembrar que **regra ligada apaga de verdade**. A tela Institucional › LGPD faz a simulação.

## R7. Trocar ou rotacionar uma credencial

Seguir a tabela da seção 6 de [`docs/lgpd/incidentes.md`](../lgpd/incidentes.md). Regra geral: gerar a nova no fornecedor, atualizar na Vercel (Production e Preview) e no `.env.local`, e fazer **redeploy** (variável só entra em vigor num build novo). Cuidado especial:
- `SUPABASE_JWT_SECRET`: invalida links de votação, carteirinhas e "ver como".
- `SAUDE_RELATORIO_CHAVE`: exige recifrar antes de descartar a antiga.

## R8. Recriar o projeto na Vercel (do zero)

1. Importar o repositório; Root Directory = raiz.
2. **Antes do primeiro deploy:** Settings → Functions → Region = **São Paulo (gru1)**.
3. Copiar todas as variáveis de ambiente (lista em [`integracoes.md`](integracoes.md)).
4. Domains: `confluir.online`, `www.confluir.online` e `*.confluir.online` (nameservers já estão na Vercel).
5. Plano Pro: os crons de 15 minutos (`vercel.json`) não rodam no Hobby.
6. Reapontar o webhook do Telegram (`docs/telegram-deploy.md`).
7. Conferir: login, um subdomínio de entidade, `/api/schema/deriva/tick` com o segredo.

## R9. Ambiente de demonstração

- Tenant `demo` (dados fictícios) no **mesmo banco de produção**.
- Dev server com `NEXT_PUBLIC_EMP_PROPRIETARIA_ID=11111111-1111-4111-8111-111111111111` (preview `confluir-demo`, porta 3222).
- Seeds em `supabase/seed/demo/` (ordem em `scripts/restaurar.mjs`). Rodar seed contra produção **só** com o tenant demo como alvo: cada seed apaga e recria apenas os dados da empresa demo.
