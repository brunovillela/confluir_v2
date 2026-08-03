-- Confluir — vínculo direto contrato ↔ ordem de pagamento (2026-07-25)
--
-- Fecha o item marcado como "OBRIGATÓRIO antes do lançamento real" em
-- supabase/contratos.sql: até agora o detalhe do contrato listava as ordens
-- pela via INDIRETA do fornecedor (mostrava ordens de OUTROS contratos do
-- mesmo fornecedor). Com a coluna abaixo, o contrato passa a GERAR e LISTAR
-- suas próprias ordens (uma por competência: mensal, anual ou única).
--
-- `ordens_pagamento` já tem RLS/emp (está nas 109 tabelas tenant-owned); a
-- coluna nova só acrescenta o vínculo. Idempotente.

alter table ordens_pagamento
  add column if not exists contrato_id uuid references contratos(id);

create index if not exists idx_ordens_contrato
  on ordens_pagamento (contrato_id);
