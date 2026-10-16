-- Compras em MARKETPLACE (16/10/2026).
--
-- Na compra num marketplace (Mercado Livre, Amazon, Shopee…) o pagamento vai
-- para a plataforma, mas a nota fiscal chega depois e é emitida pelo VENDEDOR
-- — outra empresa. O fornecimento passa a guardar:
--   - nota_a_receber: a nota ainda não veio (lista "Notas a receber");
--   - nota_aviso_em: quando quem comprou foi avisado por e-mail (7 dias);
--   - vendedor_id: o fornecedor de fato ("XYZ, comprado através do …").
-- E o cadastro da empresa marca quem é marketplace.
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.empresa
  add column if not exists marketplace boolean not null default false;

alter table public.compras_fornecimentos
  add column if not exists nota_a_receber boolean not null default false,
  add column if not exists nota_aviso_em timestamptz,
  add column if not exists vendedor_id uuid references public.empresa(id) on delete set null;

create index if not exists compras_fornecimentos_nota_a_receber_idx
  on public.compras_fornecimentos (emp_proprietaria_id)
  where nota_a_receber;

create index if not exists compras_fornecimentos_vendedor_idx
  on public.compras_fornecimentos (vendedor_id)
  where vendedor_id is not null;
