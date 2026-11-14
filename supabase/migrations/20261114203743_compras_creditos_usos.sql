-- POR QUÊ: o crédito de uma compra cancelada pelo vendedor (20261114201850)
-- só podia ser "marcado como usado". Agora ele é abatido na compra nova: a
-- ordem sai com o valor já descontado. O uso pode ser parcial (sobra saldo) e
-- é desfeito se a ordem que o usou for cancelada — por isso cada uso é uma
-- linha, e não uma coluna no crédito.
--
-- COMO: compras_creditos_usos liga o crédito (o fornecimento cancelado) à
-- ordem e ao processo que o usaram, com o valor abatido. Saldo do crédito =
-- cancelamento_valor − soma dos usos não desfeitos. Quando o saldo zera, o
-- crédito ganha credito_usado_em (sai de "Créditos com fornecedores").
-- RLS por tenant, set_emp_from_jwt e auditoria. Idempotente.

create table if not exists public.compras_creditos_usos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  credito_fornecimento_id uuid not null references public.compras_fornecimentos(id) on delete cascade,
  processo_id uuid references public.compras_solicitacoes(id) on delete set null,
  ordem_id uuid references public.ordens_pagamento(id) on delete set null,
  valor numeric(12,2) not null check (valor > 0),
  criado_por_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  desfeito_em timestamptz,
  desfeito_motivo text
);
create index if not exists compras_creditos_usos_credito on public.compras_creditos_usos (credito_fornecimento_id);
create index if not exists compras_creditos_usos_ordem on public.compras_creditos_usos (ordem_id);

alter table public.compras_creditos_usos enable row level security;
drop policy if exists tenant_isolation on public.compras_creditos_usos;
create policy tenant_isolation on public.compras_creditos_usos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.compras_creditos_usos;
create trigger set_emp_from_jwt before insert on public.compras_creditos_usos
  for each row execute function public.set_emp_from_jwt();
drop trigger if exists auditoria_registrar on public.compras_creditos_usos;
create trigger auditoria_registrar after insert or update or delete on public.compras_creditos_usos
  for each row execute function public.registrar_auditoria();
revoke all on table public.compras_creditos_usos from public, anon;
grant select, insert, update on table public.compras_creditos_usos to authenticated;
grant all on table public.compras_creditos_usos to service_role;

comment on table public.compras_creditos_usos is 'Cada uso do crédito de uma compra cancelada pelo vendedor: a ordem e o processo da compra nova em que foi abatido e quanto. Desfeito (desfeito_em) quando a ordem que o usou é cancelada. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.compras_creditos_usos.credito_fornecimento_id is 'O crédito: o fornecimento cancelado com cancelamento_desfecho = credito. [lgpd:nenhum]';
comment on column public.compras_creditos_usos.processo_id is 'Processo de compra em que o crédito foi abatido. [lgpd:nenhum]';
comment on column public.compras_creditos_usos.ordem_id is 'Ordem de pagamento que saiu com o valor descontado. [lgpd:nenhum]';
comment on column public.compras_creditos_usos.valor is 'Valor do crédito abatido nesta compra. [lgpd:financeiro]';
comment on column public.compras_creditos_usos.criado_por_id is 'Quem abateu o crédito. [lgpd:identificacao]';
comment on column public.compras_creditos_usos.desfeito_em is 'Quando o uso foi desfeito (ordem cancelada): o valor volta ao saldo do crédito. [lgpd:nenhum]';
comment on column public.compras_creditos_usos.desfeito_motivo is 'Por que o uso foi desfeito. [lgpd:nenhum]';
