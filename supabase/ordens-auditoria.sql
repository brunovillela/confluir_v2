-- Ordens de pagamento: rito de autorização, trilha e auditoria (30/09/2026).
--
-- - Alçada por VALOR para todas as origens; a folha de pagamento e as parcelas
--   ordinárias fixas de contrato nascem com a autorização DISPENSADA (o motivo
--   fica registrado na ordem).
-- - Cancelamento com motivo, quem e quando.
-- - Trilha de eventos da ordem (autorização, devolução, pagamento, correção,
--   cancelamento…) para o extrato e a auditoria.
-- - Configuração do Financeiro: centro de custo do DÉBITO das compras pagas
--   em dinheiro (a conta do caixa, ex.: 11101 Caixa Movimento).
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.ordens_pagamento
  add column if not exists autorizacao_dispensada boolean not null default false,
  add column if not exists autorizacao_dispensa_motivo text,
  add column if not exists cancelamento_motivo text,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por_id uuid references public.usuarios (id);

-- ── Trilha de eventos ───────────────────────────────────────────────────────
create table if not exists public.ordens_pagamento_eventos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  ordem_id uuid not null references public.ordens_pagamento (id) on delete cascade,
  -- criada | autorizacao_dispensada | autorizada | devolvida | reenviada |
  -- paga | pagamento_removido | corrigida | cancelada
  tipo text not null,
  usuario_id uuid references public.usuarios (id),
  descricao text,
  dados jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ordens_pagamento_eventos_ordem_idx
  on public.ordens_pagamento_eventos (ordem_id, created_at);

alter table public.ordens_pagamento_eventos enable row level security;
drop policy if exists tenant_isolation on public.ordens_pagamento_eventos;
create policy tenant_isolation on public.ordens_pagamento_eventos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.ordens_pagamento_eventos to authenticated;
drop trigger if exists set_emp_from_jwt on public.ordens_pagamento_eventos;
create trigger set_emp_from_jwt before insert on public.ordens_pagamento_eventos
  for each row execute function public.set_emp_from_jwt();

-- ── Configuração do Financeiro ──────────────────────────────────────────────
create table if not exists public.financeiro_config (
  emp_proprietaria_id uuid primary key,
  centro_custo_caixa_id uuid references public.centros_de_custo (id),
  updated_at timestamptz not null default now()
);

alter table public.financeiro_config enable row level security;
drop policy if exists tenant_isolation on public.financeiro_config;
create policy tenant_isolation on public.financeiro_config for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.financeiro_config to authenticated;
drop trigger if exists set_emp_from_jwt on public.financeiro_config;
create trigger set_emp_from_jwt before insert on public.financeiro_config
  for each row execute function public.set_emp_from_jwt();
