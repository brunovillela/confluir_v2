# 0015. Migração do Bubble por `bubble_id`, com convivência depois da virada

- **Status:** aceita
- **Data:** carga inicial em 06/2026, backfill em 05/08/2026, virada da Filiação em 14/09/2026 e do Financeiro em 30/09/2026, convivência registrada em 08/10/2026.

- **Contexto:** o sistema anterior (Bubble) foi migrado por partes. A carga de junho trouxe campos "ocos", e o Bubble continuou recebendo dados depois de cada virada: portal do filiado, hotel e rotinas agendadas como a de anuênios.
- **Decisão:** cada registro migrado guarda `bubble_id` (456 ocorrências na linha de base). A migração é feita por scripts próprios por domínio, idempotentes, com simulação por padrão e `--apply`. Eles casam por `bubble_id`, preenchem só colunas nulas (`--so-preenche`) quando o dado local já foi trabalhado e ficam travados no tenant real. Uma auditoria de schema (`/api/1.1/meta` × OpenAPI do PostgREST) mede o que falta.
- **Consequências:**
  - O cursor do Bubble para em 50.000 registros, então a leitura é feita em janelas por `Created Date`.
  - O booleano `false` explícito não conta como preenchido.
  - Não aplicar `migrar-financeiro-bubble --so ordens` sem investigar: a simulação queria trocar o autorizador de 2.643 ordens.
  - Arquivos antigos seguem como URL do CDN do Bubble.
  - `BUBBLE_API_ROOT` pode apontar para version-test.
  - Desligar o Bubble (portal, hotel e workflows) é decisão pendente do usuário. Até lá, rodadas de delta continuam.
- **Onde está:** `scripts/auditar-bubble.mjs`, `scripts/migrar-*-bubble.mjs` (cerca de 20 scripts), `scripts/backfill-migracao.mjs`, `scripts/sincronizar-condicao-bubble.mjs`, `src/lib/db/filiacao-documentos.ts` (URLs do CDN).
