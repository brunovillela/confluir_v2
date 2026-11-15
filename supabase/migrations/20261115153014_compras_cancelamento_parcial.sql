-- POR QUÊ: o vendedor às vezes cancela só parte da compra (um item em falta).
-- O registro de cancelamento (20261114201850) tratava a compra inteira como
-- cancelada: saía dos recebimentos, da nota pendente e mudava a situação.
--
-- COMO: cancelamento_parcial = true marca que só cancelamento_valor foi
-- cancelado; a compra segue ativa (recebimento, nota, situação) e o valor vira
-- crédito ou devolução como no total. cancelamento_ordem_reduzida_id guarda a
-- ordem não paga que foi reduzida no valor cancelado, para o desfazer
-- devolver o valor. Idempotente.

alter table public.compras_fornecimentos
  add column if not exists cancelamento_parcial boolean not null default false,
  add column if not exists cancelamento_ordem_reduzida_id uuid references public.ordens_pagamento(id) on delete set null;

comment on column public.compras_fornecimentos.cancelamento_parcial is 'O vendedor cancelou só parte da compra (cancelamento_valor): a compra segue ativa. false = cancelamento da compra toda. [lgpd:nenhum]';
comment on column public.compras_fornecimentos.cancelamento_ordem_reduzida_id is 'Cancelamento parcial: ordem ainda não paga que teve o valor reduzido no valor cancelado (desfazer devolve o valor). [lgpd:nenhum]';
