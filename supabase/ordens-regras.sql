-- Ordens de pagamento: regras de verificação configuráveis por tenant (30/09/2026).
--
-- Antes de criar uma ordem, o sistema confere as regras da ORIGEM dela
-- (compras, contrato, RPA, folha, diária, custeio, reembolso, hospedagem,
-- multa, locação). Cada regra é configurada por tenant e por origem:
--   aceitar  → não verifica;
--   alertar  → cria a ordem e registra o alerta;
--   bloquear → não cria a ordem.
-- O resultado de cada verificação fica gravado na ordem.
--
-- Idempotente: pode rodar mais de uma vez.

-- ── Permissão ───────────────────────────────────────────────────────────────
-- `atualizarAcesso` grava todas as chaves do catálogo: a coluna precisa
-- existir ANTES do deploy.
alter table public.permissoes
  add column if not exists financeiro_auditoria boolean;

comment on column public.permissoes.financeiro_auditoria is
  'Configurar as regras de verificação das ordens de pagamento (Financeiro → Auditoria das ordens).';

-- ── Configuração das regras ─────────────────────────────────────────────────
create table if not exists public.auditoria_regras (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  -- compras | contrato | rpa | folha | diaria | custeio | reembolso |
  -- hospedagem | multa | locacao
  origem text not null,
  codigo text not null,
  severidade text not null check (severidade in ('aceitar', 'alertar', 'bloquear')),
  parametros jsonb not null default '{}'::jsonb,
  atualizado_por uuid references public.usuarios (id),
  updated_at timestamptz not null default now(),
  unique (emp_proprietaria_id, origem, codigo)
);

alter table public.auditoria_regras enable row level security;
drop policy if exists tenant_isolation on public.auditoria_regras;
create policy tenant_isolation on public.auditoria_regras for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.auditoria_regras to authenticated;
drop trigger if exists set_emp_from_jwt on public.auditoria_regras;
create trigger set_emp_from_jwt before insert on public.auditoria_regras
  for each row execute function public.set_emp_from_jwt();

-- ── Resultado das verificações, gravado na criação da ordem ─────────────────
create table if not exists public.ordens_pagamento_verificacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  ordem_id uuid not null references public.ordens_pagamento (id) on delete cascade,
  origem text not null,
  codigo text not null,
  titulo text not null,
  -- a severidade configurada no momento da verificação
  severidade text not null,
  -- ok | alerta | na  (bloqueio não chega a gravar: a ordem não é criada)
  status text not null,
  detalhe text,
  created_at timestamptz not null default now()
);

create index if not exists ordens_pagamento_verificacoes_ordem_idx
  on public.ordens_pagamento_verificacoes (ordem_id);

alter table public.ordens_pagamento_verificacoes enable row level security;
drop policy if exists tenant_isolation on public.ordens_pagamento_verificacoes;
create policy tenant_isolation on public.ordens_pagamento_verificacoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.ordens_pagamento_verificacoes to authenticated;
drop trigger if exists set_emp_from_jwt on public.ordens_pagamento_verificacoes;
create trigger set_emp_from_jwt before insert on public.ordens_pagamento_verificacoes
  for each row execute function public.set_emp_from_jwt();
