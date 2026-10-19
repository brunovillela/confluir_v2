-- Confluir — Faturas do cartão de crédito (19/10/2026)
--
-- POR QUÊ: compra paga com cartão de CRÉDITO gerava uma ordem que o
-- Financeiro pagava sozinha, como se o dinheiro fosse ao fornecedor. O
-- dinheiro sai, de fato, no pagamento da FATURA do cartão. Pedido do
-- usuário: como o Caixa, mas segregado em faturas (a lógica das remessas de
-- diárias) — as compras entram na fatura aberta do cartão; no fechamento, o
-- Financeiro informa o valor, sobe a fatura e gera UMA ordem de pagamento,
-- rateada pelos centros de custo das compras (a diferença — juros, IOF,
-- anuidade, estorno — num centro escolhido no fechamento).
--
-- COMO:
--   1. financeiro_cartao_faturas: uma fatura por cartão e ciclo; só uma
--      "aberta" por cartão (índice parcial). Fechada, guarda valor, vencimento,
--      arquivo, centro da diferença e a ordem gerada.
--   2. ordens_pagamento.cartao_fatura_id: a ordem da COMPRA pertence à fatura.
--      Autorizada, ela fica "Na fatura" (não é paga sozinha e sai das somas de
--      despesa — a despesa é a ordem da fatura, com o rateio).

create table if not exists public.financeiro_cartao_faturas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  cartao_id uuid not null references public.cartoes(id),
  numero integer not null,
  situacao text not null default 'aberta',
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  fechada_por_usuario_id uuid references public.usuarios(id),
  valor_fatura numeric(12,2),
  vencimento date,
  arquivo_fatura text,
  centro_diferenca_id uuid references public.centros_de_custo(id),
  ordem_pagamento_id uuid references public.ordens_pagamento(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now(),
  constraint financeiro_cartao_faturas_situacao_check check (situacao in ('aberta', 'fechada')),
  constraint financeiro_cartao_faturas_numero_unico unique (cartao_id, numero)
);

create unique index if not exists financeiro_cartao_faturas_uma_aberta
  on public.financeiro_cartao_faturas (cartao_id) where situacao = 'aberta';
create index if not exists financeiro_cartao_faturas_tenant_idx
  on public.financeiro_cartao_faturas (emp_proprietaria_id, cartao_id, numero desc);

alter table public.financeiro_cartao_faturas enable row level security;
drop policy if exists tenant_isolation on public.financeiro_cartao_faturas;
create policy tenant_isolation on public.financeiro_cartao_faturas to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

drop trigger if exists set_emp_from_jwt on public.financeiro_cartao_faturas;
create trigger set_emp_from_jwt before insert on public.financeiro_cartao_faturas
  for each row execute function public.set_emp_from_jwt();

revoke all on table public.financeiro_cartao_faturas from public, anon;
grant select, insert, update, delete on table public.financeiro_cartao_faturas to authenticated;
grant all on table public.financeiro_cartao_faturas to service_role;

alter table public.ordens_pagamento
  add column if not exists cartao_fatura_id uuid references public.financeiro_cartao_faturas(id);
create index if not exists ordens_pagamento_cartao_fatura_idx
  on public.ordens_pagamento (cartao_fatura_id) where cartao_fatura_id is not null;

comment on table public.financeiro_cartao_faturas is 'Faturas dos cartões de crédito da entidade: as compras pagas com o cartão entram na fatura aberta; no fechamento o Financeiro informa o valor, anexa a fatura e gera uma ordem de pagamento rateada pelos centros de custo das compras (src/lib/db/cartao-faturas.ts). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.financeiro_cartao_faturas.cartao_id is 'Cartão de crédito da fatura.';
comment on column public.financeiro_cartao_faturas.numero is 'Sequência da fatura no cartão (1, 2, 3…).';
comment on column public.financeiro_cartao_faturas.situacao is 'aberta (recebe compras; só uma por cartão) ou fechada (gerou a ordem de pagamento).';
comment on column public.financeiro_cartao_faturas.aberta_em is 'Quando a fatura passou a receber compras.';
comment on column public.financeiro_cartao_faturas.fechada_em is 'Quando o Financeiro fechou a fatura.';
comment on column public.financeiro_cartao_faturas.fechada_por_usuario_id is 'Quem fechou a fatura. [lgpd:identificacao]';
comment on column public.financeiro_cartao_faturas.valor_fatura is 'Valor da fatura informado no fechamento (pode diferir da soma das compras: juros, IOF, anuidade, estornos).';
comment on column public.financeiro_cartao_faturas.vencimento is 'Vencimento da fatura (vira o vencimento da ordem).';
comment on column public.financeiro_cartao_faturas.arquivo_fatura is 'Caminho do PDF da fatura no bucket compras (faturas-cartao/...).';
comment on column public.financeiro_cartao_faturas.centro_diferenca_id is 'Centro de custo da diferença entre o valor da fatura e a soma das compras.';
comment on column public.financeiro_cartao_faturas.ordem_pagamento_id is 'Ordem de pagamento gerada no fechamento.';
comment on column public.financeiro_cartao_faturas.observacao is 'Observação de quem fechou (ex.: o que explica a diferença).';
comment on column public.financeiro_cartao_faturas.created_at is 'Criação do registro.';
comment on column public.ordens_pagamento.cartao_fatura_id is 'Fatura do cartão de crédito a que pertence a ordem da compra; autorizada, a ordem fica "Na fatura" e é quitada pela ordem da fatura.';
