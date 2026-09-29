-- Compras: detalhe da forma de pagamento na aquisição direta (29/09/2026).
--
-- Toda compra é auditada: além da FORMA, a ordem de pagamento passa a dizer
-- COM O QUÊ foi paga:
--   Cartão          → qual cartão da entidade (tabela nova `cartoes`);
--   Dinheiro        → de qual conta de caixa saiu (e a compra debita o caixa);
--   Pix             → qual chave do fornecedor (dados_bancarios);
--   TED             → qual conta do fornecedor (dados_bancarios);
--   Pix (QR Code)   → o código copia e cola usado (coluna já existente pix_codigo);
--   Outro           → qual forma (texto).
--
-- Idempotente: pode rodar mais de uma vez.

-- Cartões da entidade. Guarda SÓ os 4 últimos dígitos — nunca o número inteiro.
create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  apelido text not null,
  tipo text not null default 'credito' check (tipo in ('credito', 'debito', 'pre_pago')),
  bandeira text,
  final text not null check (final ~ '^[0-9]{4}$'),
  titular_usuario_id uuid references public.usuarios (id),
  ativo boolean not null default true,
  criado_por_usuario_id uuid references public.usuarios (id),
  created_at timestamptz not null default now()
);

create index if not exists cartoes_tenant_idx
  on public.cartoes (emp_proprietaria_id, ativo);

-- Isolamento por tenant (padrão atual: leitura pelo JWT do tenant; ver
-- src/lib/supabase/admin.ts e rls-tenant-isolation.sql).
alter table public.cartoes enable row level security;
drop policy if exists tenant_isolation on public.cartoes;
create policy tenant_isolation on public.cartoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.cartoes to authenticated;
drop trigger if exists set_emp_from_jwt on public.cartoes;
create trigger set_emp_from_jwt before insert on public.cartoes
  for each row execute function public.set_emp_from_jwt();

alter table public.ordens_pagamento
  add column if not exists cartao_id uuid references public.cartoes (id),
  add column if not exists caixa_conta_id uuid references public.caixa_contas (id),
  add column if not exists dados_bancarios_id uuid references public.dados_bancarios (id),
  add column if not exists forma_detalhe text;

-- A compra em dinheiro debita o caixa; o débito aponta para a ordem.
alter table public.caixa_movimentacoes
  add column if not exists ordem_pagamento_id uuid references public.ordens_pagamento (id);
