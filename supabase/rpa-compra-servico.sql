-- ═══════════════════════════════════════════════════════════════════════════
-- RPA DE COMPRA DE SERVIÇO (2026-10-02). Idempotente.
-- Roda depois de supabase/compras-rpa.sql, contratos-rpa.sql e rpa-avulso.sql.
--
-- Pedido de 02/10: sai o RPA avulso; o RPA nasce de um CONTRATO ou de uma
-- COMPRA DE SERVIÇO (Aquisição, tipo "Prestação de serviço"). Da compra vêm o
-- prestador (fornecedor do fornecimento), o serviço, o departamento e o centro
-- de custo; quem emite completa o pagamento. A ordem do líquido vira a ordem
-- do fornecimento, e o valor da compra passa a ser o líquido do RPA.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.compras_rpa
  add column if not exists processo_compra_id uuid references public.compras_solicitacoes (id) on delete set null;
alter table public.compras_rpa
  add column if not exists fornecimento_id uuid references public.compras_fornecimentos (id) on delete set null;

create index if not exists compras_rpa_fornecimento_idx on public.compras_rpa (fornecimento_id);

comment on column public.compras_rpa.processo_compra_id is
  'Compra de serviço que originou o RPA (desde 02/10/2026). Nulo = RPA de contrato.';
comment on column public.compras_rpa.fornecimento_id is
  'Fornecimento da compra pago por este RPA — a ordem do líquido é a ordem dele.';
comment on column public.compras_rpa.contrato_id is
  'Contrato a que o RPA pertence. Nulo = RPA de compra de serviço (processo_compra_id) ou anterior a 29/09/2026.';

notify pgrst, 'reload schema';
