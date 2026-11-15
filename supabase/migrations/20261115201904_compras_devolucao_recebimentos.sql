-- POR QUÊ: a devolução de compra cancelada pelo vendedor (20261115144534) só
-- sabia "recebida" ou "a receber", sempre pelo valor cancelado. Na prática a
-- loja desconta taxa ou devolve em partes, e a diferença sumia. E a devolução
-- parada não tinha como registrar que o fornecedor já foi cobrado.
--
-- COMO:
--   compras_devolucoes_recebimentos  cada dinheiro que voltou: valor, data, o
--                                    lançamento do extrato (quando conciliado)
--                                    e a observação. Saldo a receber =
--                                    cancelamento_valor − soma dos recebimentos.
--   devolucao_perda_valor/_obs       a diferença que não vai voltar, dada como
--                                    perda, com o motivo (encerra a devolução).
--   devolucao_cobrada_em/_obs        a última cobrança feita ao fornecedor; o
--                                    aviso de devolução parada conta dela.
-- devolucao_recebida_em continua marcando a devolução encerrada (recebida
-- inteira, ou com a diferença dada como perda). Devoluções recebidas antes
-- desta migração seguem só com as colunas antigas. RLS por tenant,
-- set_emp_from_jwt e auditoria. Idempotente.

create table if not exists public.compras_devolucoes_recebimentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  fornecimento_id uuid not null references public.compras_fornecimentos(id) on delete cascade,
  valor numeric(12,2) not null check (valor > 0),
  data date not null,
  lancamento_id uuid references public.banco_lancamentos(id) on delete set null,
  obs text,
  registrado_por_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists compras_devolucoes_recebimentos_fornecimento on public.compras_devolucoes_recebimentos (fornecimento_id);
create index if not exists compras_devolucoes_recebimentos_lancamento on public.compras_devolucoes_recebimentos (lancamento_id);

alter table public.compras_devolucoes_recebimentos enable row level security;
drop policy if exists tenant_isolation on public.compras_devolucoes_recebimentos;
create policy tenant_isolation on public.compras_devolucoes_recebimentos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.compras_devolucoes_recebimentos;
create trigger set_emp_from_jwt before insert on public.compras_devolucoes_recebimentos
  for each row execute function public.set_emp_from_jwt();
drop trigger if exists auditoria_registrar on public.compras_devolucoes_recebimentos;
create trigger auditoria_registrar after insert or update or delete on public.compras_devolucoes_recebimentos
  for each row execute function public.registrar_auditoria();
revoke all on table public.compras_devolucoes_recebimentos from public, anon;
grant select, insert, update, delete on table public.compras_devolucoes_recebimentos to authenticated;
grant all on table public.compras_devolucoes_recebimentos to service_role;

alter table public.compras_fornecimentos
  add column if not exists devolucao_perda_valor numeric(12,2),
  add column if not exists devolucao_perda_obs text,
  add column if not exists devolucao_cobrada_em date,
  add column if not exists devolucao_cobranca_obs text;

comment on table public.compras_devolucoes_recebimentos is 'Cada valor que voltou da devolução de uma compra cancelada pelo vendedor (pode vir em partes ou menor que o cancelado). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.compras_devolucoes_recebimentos.fornecimento_id is 'O fornecimento cancelado com cancelamento_desfecho = devolucao. [lgpd:nenhum]';
comment on column public.compras_devolucoes_recebimentos.valor is 'Quanto voltou neste recebimento. [lgpd:financeiro]';
comment on column public.compras_devolucoes_recebimentos.data is 'Data em que o dinheiro voltou. [lgpd:nenhum]';
comment on column public.compras_devolucoes_recebimentos.lancamento_id is 'Crédito do extrato bancário conciliado com este recebimento. [lgpd:nenhum]';
comment on column public.compras_devolucoes_recebimentos.obs is 'Como o dinheiro voltou (extrato, estorno na fatura do cartão…). [lgpd:nenhum]';
comment on column public.compras_devolucoes_recebimentos.registrado_por_id is 'Quem registrou o recebimento. [lgpd:identificacao]';
comment on column public.compras_fornecimentos.devolucao_perda_valor is 'Parte da devolução que não vai voltar, dada como perda ao encerrar a devolução. [lgpd:financeiro]';
comment on column public.compras_fornecimentos.devolucao_perda_obs is 'Motivo da diferença dada como perda (taxa retida, fornecedor não devolveu…). [lgpd:nenhum]';
comment on column public.compras_fornecimentos.devolucao_cobrada_em is 'Última vez que o fornecedor foi cobrado pela devolução; o aviso de devolução parada conta desta data. [lgpd:nenhum]';
comment on column public.compras_fornecimentos.devolucao_cobranca_obs is 'Como foi a última cobrança (protocolo, canal, resposta). [lgpd:nenhum]';
