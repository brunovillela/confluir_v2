# 0003. Isolamento de tenant no banco (RLS) e dois clientes Supabase

- **Status:** aceita
- **Data:** 25/08/2026 (backstop de RLS). Regras complementares em 29/09/2026 e 03/10/2026.

- **Contexto:** com todas as entidades no mesmo banco, uma query que esqueça o filtro `emp_proprietaria_id` vazaria dados entre tenants (IDOR por id). Confiar só na aplicação era frágil. Em 25/08, `usuarios`, `filiacoes` e `empresa` ainda vazavam leitura por causa de policies legadas `using(true)`.
- **Decisão:** a defesa fica no banco. Toda tabela tenant-owned tem a policy `tenant_isolation`, que compara `emp_proprietaria_id` com a claim `tenant_id` do JWT, e o trigger `set_emp_from_jwt`. O código de tenant usa só `createAdminClient()`, um cliente híbrido: lê sob um JWT `authenticated` curto, de 60 s, com a claim `tenant_id`, e portanto respeita o RLS. Escreve pelo tenant quando a tabela está em `TABELAS_TENANT` ou `TABELAS_TENANT_POR_PAI`, e pelo service role nas demais. O `createServiceClient()`, que ignora o RLS, fica restrito a plataforma, proxy, ticks, webhooks e API, e uma regra de ESLint faz cumprir essa restrição.
- **Consequências:**
  - Uma tabela nova só com "deny-all" grava mas volta vazia na leitura. Ela precisa da policy `tenant_isolation`, do grant, do trigger e de entrar em `TABELAS_TENANT`, nessa ordem e só depois de a migração rodar (listada sem grant dá erro 42501).
  - Um SQL que recrie policies (num rename, por exemplo) copia o predicado de tenant e nunca usa `true`. O linter do Supabase não revisa SELECT `using(true)`.
  - `.storage`, `.auth`, `.rpc` e `.functions` vão pelo service role. `.rpc` precisa de bind (correção f884bd8).
  - Todo upload passa por `conferirArquivo()` dentro do proxy de storage, que confere os magic bytes e recusa SVG e HTML. Não usar o storage por outro cliente.
  - O cliente carimba `x-confluir-usuario`, usado pela auditoria (ver 0013).
  - A migração de linha de base achou 65 colunas com DEFAULT igual ao UUID do tenant principal, um risco de isolamento ainda aberto.
  - O filtro explícito `.eq("emp_proprietaria_id", …)` continua nas consultas do código, mesmo onde o RLS já filtraria a leitura: é defesa em profundidade, não redundância. A escrita em tabela fora de `TABELAS_TENANT` e o `.rpc` vão pelo service role, que ignora o RLS; ali o filtro é a única barreira. Padrão da casa (07/11/2026: 234 de 295 arquivos de `src/lib/db`).
  - Script de conferência com a `SUPABASE_SERVICE_ROLE_KEY` enxerga todas as entidades e engana: em 06–07/11 levou a alegar "listas misturando entidades" que o app não mostrava. Para testar isolamento, usar um token de entidade (o mesmo HMAC de `jwtDoTenant`) ou `npm run db:isolamento` (07/11/2026), que confere, só lendo e uma consulta leve por vez, que nenhuma entidade lê linhas de outra nem a chave pública lê nada. Rodar depois de toda migração que cria tabela ou view.
- **Onde está:** `src/lib/supabase/admin.ts` (`createAdminClient`, `createServiceClient`, `jwtDoTenant`, `storageConferido`), `src/lib/supabase/tabelas-tenant.ts` (`TABELAS_TENANT`, `TABELAS_TENANT_POR_PAI`, `escrevePeloTenant`), `eslint.config.mjs` (`PODEM_USAR_SERVICE_ROLE` + `no-restricted-imports`), `src/lib/uploads.ts`, `docs/dados/rls.md`.
- **Observações:** o docstring de `createServiceClient` foi alinhado à allowlist `PODEM_USAR_SERVICE_ROLE` do `eslint.config.mjs` em 19/10/2026.
