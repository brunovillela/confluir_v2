-- POR QUÊ: compra cancelada pelo vendedor (20261114201850) com devolução do
-- dinheiro só ficava na trilha da ordem — ninguém conferia se o dinheiro
-- voltou. E o crédito para compras futuras costuma ter validade (vale-crédito
-- de loja), que o sistema não sabia.
--
-- COMO: no fornecimento cancelado,
--   devolucao_recebida_em/_por_id/_obs  quando o dinheiro voltou (pela
--                                       conciliação do extrato ou marcado à mão,
--                                       ex.: estorno na fatura do cartão);
--   devolucao_lancamento_id             o crédito do extrato que trouxe o dinheiro;
--   credito_validade                    até quando o crédito vale (opcional).
-- Devolução a receber = cancelamento_desfecho 'devolucao' e devolucao_recebida_em
-- nulo. Idempotente.

alter table public.compras_fornecimentos
  add column if not exists devolucao_recebida_em timestamptz,
  add column if not exists devolucao_recebida_por_id uuid references public.usuarios(id) on delete set null,
  add column if not exists devolucao_recebida_obs text,
  add column if not exists devolucao_lancamento_id uuid references public.banco_lancamentos(id) on delete set null,
  add column if not exists credito_validade date;

create index if not exists compras_fornecimentos_devolucao_aberta_idx
  on public.compras_fornecimentos (emp_proprietaria_id)
  where cancelamento_desfecho = 'devolucao' and devolucao_recebida_em is null;

comment on column public.compras_fornecimentos.devolucao_recebida_em is 'Quando o dinheiro da compra cancelada voltou (devolução recebida). Nulo com desfecho devolucao = devolução a receber. [lgpd:nenhum]';
comment on column public.compras_fornecimentos.devolucao_recebida_por_id is 'Quem confirmou que a devolução chegou. [lgpd:identificacao]';
comment on column public.compras_fornecimentos.devolucao_recebida_obs is 'Como a devolução chegou (crédito no extrato, estorno na fatura do cartão…). [lgpd:nenhum]';
comment on column public.compras_fornecimentos.devolucao_lancamento_id is 'Lançamento do extrato bancário que trouxe a devolução, quando conciliado. [lgpd:nenhum]';
comment on column public.compras_fornecimentos.credito_validade is 'Até quando o crédito do cancelamento pode ser usado. Vencido, não é mais abatido. [lgpd:nenhum]';
