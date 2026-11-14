-- POR QUÊ: compra feita (marketplace ou não) que o vendedor cancela depois —
-- o dinheiro volta (estorno, depósito) ou vira crédito para compras futuras.
-- Não havia onde registrar isso, e a compra ficava para sempre em "Notas a
-- receber", cobrando uma nota que nunca vai chegar.
--
-- COMO: o fornecimento guarda o desfecho do cancelamento (crédito ou
-- devolução), valor, data, observação e o comprovante; o crédito em aberto é
-- o que tem cancelamento_desfecho = 'credito' e credito_usado_em nulo, até
-- alguém marcar em que compra foi usado. Idempotente.

alter table public.compras_fornecimentos
  add column if not exists cancelamento_desfecho text,
  add column if not exists cancelamento_valor numeric(12,2),
  add column if not exists cancelamento_data date,
  add column if not exists cancelamento_obs text,
  add column if not exists cancelamento_comprovante_url text,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por_id uuid references public.usuarios(id) on delete set null,
  add column if not exists credito_usado_em timestamptz,
  add column if not exists credito_usado_por_id uuid references public.usuarios(id) on delete set null,
  add column if not exists credito_usado_obs text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_fornecimentos_cancelamento_desfecho_check') then
    alter table public.compras_fornecimentos
      add constraint compras_fornecimentos_cancelamento_desfecho_check
      check (cancelamento_desfecho is null or cancelamento_desfecho in ('credito', 'devolucao'));
  end if;
end $$;

create index if not exists compras_fornecimentos_credito_aberto_idx
  on public.compras_fornecimentos (emp_proprietaria_id)
  where cancelamento_desfecho = 'credito' and credito_usado_em is null;

comment on column public.compras_fornecimentos.cancelamento_desfecho is 'Compra cancelada pelo vendedor depois de feita: credito (para compras futuras) ou devolucao (o dinheiro voltou). Nulo = não cancelada. [lgpd:nenhum]';
comment on column public.compras_fornecimentos.cancelamento_valor is 'Valor do crédito ou da devolução informado no cancelamento. [lgpd:financeiro]';
comment on column public.compras_fornecimentos.cancelamento_data is 'Data do cancelamento (do estorno ou da concessão do crédito). [lgpd:nenhum]';
comment on column public.compras_fornecimentos.cancelamento_obs is 'Observação do cancelamento (motivo, código do crédito, como foi devolvido). [lgpd:nenhum]';
comment on column public.compras_fornecimentos.cancelamento_comprovante_url is 'Comprovante do cancelamento (e-mail do vendedor, estorno, vale-crédito) no bucket de compras. Vale como documento equivalente à nota na ordem. [lgpd:nenhum]';
comment on column public.compras_fornecimentos.cancelado_em is 'Quando o cancelamento foi registrado no sistema. [lgpd:nenhum]';
comment on column public.compras_fornecimentos.cancelado_por_id is 'Quem registrou o cancelamento. [lgpd:identificacao]';
comment on column public.compras_fornecimentos.credito_usado_em is 'Quando o crédito do cancelamento foi marcado como usado. Nulo com desfecho credito = crédito em aberto. [lgpd:nenhum]';
comment on column public.compras_fornecimentos.credito_usado_por_id is 'Quem marcou o crédito como usado. [lgpd:identificacao]';
comment on column public.compras_fornecimentos.credito_usado_obs is 'Em que compra o crédito foi usado (código do processo ou observação). [lgpd:nenhum]';
