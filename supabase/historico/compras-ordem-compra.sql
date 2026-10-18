-- Confluir — Ordem de compra enviada ao fornecedor (2026-10-10)
--
-- Cada fornecimento de um processo de compra gera a ORDEM DE COMPRA em PDF
-- (o pedido formal ao fornecedor: o que comprar, quanto, como pagar, onde e
-- quando entregar, para quem faturar). O PDF sai a qualquer momento; estas
-- colunas registram o ENVIO por e-mail ao fornecedor (para quem, quando e
-- por quem). Sem elas, o PDF e o envio funcionam, só sem o registro.
-- Idempotente.

alter table compras_fornecimentos add column if not exists oc_enviada_em timestamptz;
alter table compras_fornecimentos add column if not exists oc_enviada_para text;
alter table compras_fornecimentos add column if not exists oc_enviada_por_id uuid references usuarios(id);

comment on column compras_fornecimentos.oc_enviada_em is
  'Último envio da ordem de compra (PDF) ao fornecedor por e-mail.';

notify pgrst, 'reload schema';
