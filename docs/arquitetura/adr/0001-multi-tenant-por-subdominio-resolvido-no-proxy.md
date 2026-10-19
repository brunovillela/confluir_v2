# 0001. Multi-tenant por subdomínio, resolvido no proxy

- **Status:** aceita
- **Data:** 03/08/2026 (primeiro deploy). Assinatura do cabeçalho em 04/10/2026.

- **Contexto:** o Confluir é um SaaS para várias entidades sindicais num único banco e num único deploy. Cada requisição precisa saber de qual organização é, sem depender de parâmetro na URL nem de escolha do usuário. Desde o começo era preciso que o desenvolvimento local e o deploy com um só tenant continuassem funcionando.
- **Decisão:** o tenant vem do subdomínio (`<slug>.confluir.online`). O `src/proxy.ts`, que nesta versão do Next faz o papel do middleware (não existe `middleware.ts`), consulta a tabela `tenants` (slug → empresa_id, status) e injeta `x-tenant-id` junto com uma assinatura HMAC em `x-tenant-assinatura`. O código de servidor lê o tenant só por `tenantAtual()`.
- **Consequências:**
  - Um subdomínio desconhecido é reescrito para `/tenant-inexistente`, e um tenant suspenso para `/tenant-suspenso`.
  - Sem subdomínio (localhost, apex, `*.vercel.app`), o tenant cai em `EMP_PROPRIETARIA_ID`. Os hosts `*.vercel.app` devolvem null de propósito em `subdominioDoHost`.
  - O apex `confluir.online` e o `www` são reescritos para a landing `/site`.
  - O cache slug→tenant fica em memória por instância, com TTL de 60 s. Suspender um tenant leva até 1 min para valer.
  - `tenantAtual()` só aceita o cabeçalho que vier assinado pelo proxy (S18). Um cabeçalho forjado numa rota que o proxy não cobre não troca o tenant.
  - 1 empresa = 1 tenant (UNIQUE em `tenants.empresa_id`).
  - Nunca usar `EMP_PROPRIETARIA_ID` direto em código de tenant. Usar `await tenantAtual()`.
- **Onde está:** `src/proxy.ts` (`proxy`, `tenantDoCache`), `src/lib/tenant.ts` (`tenantAtual`), `src/lib/tenant-host.ts` (`subdominioDoHost`), `src/lib/tenant-assinatura.ts` (`assinarTenant`, `conferirTenant`), `src/lib/env.ts` (`APP_DOMAIN`, `EMP_PROPRIETARIA_ID`).
- **Observações:** os comentários de `src/lib/tenant.ts` e `src/proxy.ts` foram atualizados em 19/10/2026 para refletir o roteamento por subdomínio e a policy `tenant_isolation`.
