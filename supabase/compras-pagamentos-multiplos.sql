-- ============================================================================
-- Compras via Aquisição: vários pagamentos por fornecimento (07/10/2026).
-- Idempotente — rodar no SQL Editor do Supabase.
--
-- Até aqui cada fornecimento tinha UMA ordem (compras_fornecimentos.
-- ordem_pagamento_id). Agora a compra pode ser paga em partes (entrada +
-- parcelas, notas separadas): cada ordem aponta para o fornecimento que paga.
-- ordem_pagamento_id continua guardando a primeira, para o que já a usa
-- (recebimento, RPA). A soma das ordens não passa do valor do fornecimento.
-- ============================================================================

alter table public.ordens_pagamento
  add column if not exists fornecimento_id uuid references public.compras_fornecimentos (id) on delete set null;

create index if not exists ordens_pagamento_fornecimento_idx
  on public.ordens_pagamento (fornecimento_id)
  where fornecimento_id is not null;

-- As ordens que já existem: o vínculo que estava no fornecimento.
update public.ordens_pagamento o
set fornecimento_id = f.id
from public.compras_fornecimentos f
where f.ordem_pagamento_id = o.id
  and o.fornecimento_id is null;
