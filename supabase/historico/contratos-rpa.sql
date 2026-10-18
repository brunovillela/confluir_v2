-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRATOS › MINUTA › RPA — hierarquia (2026-09-29). Idempotente.
-- Roda depois de supabase/compras-rpa.sql e supabase/contratos-ordens.sql.
--
-- Pedido do Bruno (29/09): o contrato é a raiz; a minuta é o instrumento do
-- contrato (contratos_minutas.contrato_id, já existia) e o RPA é uma FORMA DE
-- PAGAMENTO do contrato. Decisões:
--  1. Todo RPA novo pertence a um contrato (os anteriores ficam sem, como
--     histórico). O prestador é o fornecedor do contrato.
--  2. Emitir o RPA gera a ordem de pagamento pelo valor LÍQUIDO, Em
--     autorização, ligada ao contrato — entra na lista de ordens dele.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.compras_rpa
  add column if not exists contrato_id uuid references public.contratos (id) on delete restrict;

alter table public.compras_rpa
  add column if not exists ordem_pagamento_id uuid references public.ordens_pagamento (id) on delete set null;

comment on column public.compras_rpa.contrato_id is
  'Contrato a que o RPA pertence (o RPA é uma forma de pagamento do contrato). Nulo só nos RPAs anteriores a 29/09/2026.';
comment on column public.compras_rpa.ordem_pagamento_id is
  'Ordem de pagamento gerada na emissão (valor líquido, tipo "RPA").';

create index if not exists idx_compras_rpa_contrato on public.compras_rpa (contrato_id);
create index if not exists idx_compras_rpa_ordem on public.compras_rpa (ordem_pagamento_id);

notify pgrst, 'reload schema';
