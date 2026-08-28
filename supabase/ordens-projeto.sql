-- Confluir — vínculo direto projeto ↔ ordem de pagamento (2026-08-28)
--
-- No sistema antigo (Bubble) a ordem de pagamento guardava a qual PROJETO
-- pertencia, mas esse vínculo não veio na migração (o campo
-- `projeto.ordens_pagamento_raw` chegou vazio nos 101 projetos, e a ordem não
-- tinha coluna de projeto). Esta coluna reabre o vínculo: ordens novas nascem
-- com `projeto_id`, e o filtro por projeto na lista de ordens passa a existir.
--
-- `ordens_pagamento` já tem RLS/emp (tabela tenant-owned); a coluna só
-- acrescenta o vínculo. Idempotente — pode rodar mais de uma vez.

alter table ordens_pagamento
  add column if not exists projeto_id uuid references projeto(id);

create index if not exists idx_ordens_projeto
  on ordens_pagamento (projeto_id);

-- Backfill a partir do Bubble na virada de chave:
-- `projeto.ordens_pagamento_raw` é hoje literal 'null'. Quando o CSV do Bubble
-- for recarregado (scripts/backfill-migracao.mjs) com a lista de ordens de cada
-- projeto, o vínculo pode ser reconstruído casando por `bubble_id`. Exemplo,
-- assumindo `ordens_pagamento_raw` como texto de bubble_ids separados por
-- vírgula/espaço/quebra de linha (ajustar ao formato real do export):
--
--   update ordens_pagamento o
--      set projeto_id = p.id
--     from projeto p
--    cross join lateral regexp_split_to_table(
--            coalesce(p.ordens_pagamento_raw, ''), '[\s,]+') as ref(bubble_id)
--    where o.projeto_id is null
--      and o.emp_proprietaria_id = p.emp_proprietaria_id
--      and o.bubble_id = ref.bubble_id
--      and ref.bubble_id <> '';
