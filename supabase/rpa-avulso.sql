-- ═══════════════════════════════════════════════════════════════════════════
-- RPA AVULSO + RECIBO ASSINADO (2026-10-01). Idempotente.
-- Roda depois de supabase/compras-rpa.sql e supabase/contratos-rpa.sql.
--
-- Pedido de 01/10 (revê a decisão de 29/09 "todo RPA pertence a um contrato"):
--  1. O RPA pode ser AVULSO — sem contrato. O prestador é escolhido entre os
--     fornecedores pessoa física (CPF) e quem emite informa departamento,
--     centro de custo, forma e data do pagamento. A ordem do líquido nasce do
--     mesmo jeito, com contrato_id nulo.
--  2. O recibo ASSINADO pelo prestador é anexado na página do RPA (bucket
--     privado `compras`, pasta rpa-assinados/). RPA sem recibo assinado pode
--     ser excluído; assinado, não.
--
-- O código funciona sem este SQL: o RPA avulso já grava (contrato_id sempre
-- aceitou nulo); só o anexo do recibo assinado pede as colunas abaixo.
-- ═══════════════════════════════════════════════════════════════════════════

-- contrato_id já nasceu anulável (add column sem not null); garante.
alter table public.compras_rpa alter column contrato_id drop not null;

comment on column public.compras_rpa.contrato_id is
  'Contrato a que o RPA pertence. Nulo = RPA avulso (desde 01/10/2026) ou anterior a 29/09/2026.';

-- Recibo assinado pelo prestador (PDF ou foto), no bucket privado `compras`.
alter table public.compras_rpa add column if not exists arquivo_assinado text;
alter table public.compras_rpa add column if not exists assinado_em timestamptz;
alter table public.compras_rpa add column if not exists assinado_por_id uuid references public.usuarios (id);

comment on column public.compras_rpa.arquivo_assinado is
  'Caminho (bucket compras) do recibo assinado pelo prestador. Com ele, o RPA não pode mais ser excluído.';
comment on column public.compras_rpa.assinado_em is
  'Quando o recibo assinado foi anexado.';

notify pgrst, 'reload schema';
