-- Estorno de pagamento de ordens (30/09/2026).
--
-- O banco devolve o pagamento dias depois (conta encerrada, chave Pix errada,
-- boleto vencido…). Por um prazo configurável após o pagamento (15 dias por
-- padrão), quem tem a permissão registra o COMUNICADO DE ESTORNO: a ordem
-- regride para "Aguardando informações", o pagamento anterior fica guardado
-- no estorno e quem lançou a ordem é avisado para conferir os dados bancários
-- ou o boleto e reencaminhar para autorização.
--
-- Idempotente: pode rodar mais de uma vez.

-- ── Permissão ───────────────────────────────────────────────────────────────
-- `atualizarAcesso` grava todas as chaves do catálogo: a coluna precisa
-- existir ANTES do deploy.
alter table public.permissoes
  add column if not exists financeiro_estorno boolean;

comment on column public.permissoes.financeiro_estorno is
  'Registrar estorno de pagamento de ordens pagas e configurar o prazo (Financeiro → Estornos).';

-- ── Prazo configurável ──────────────────────────────────────────────────────
alter table public.financeiro_config
  add column if not exists estorno_prazo_dias integer not null default 15;

alter table public.financeiro_config
  drop constraint if exists financeiro_config_estorno_prazo_chk;
alter table public.financeiro_config
  add constraint financeiro_config_estorno_prazo_chk
  check (estorno_prazo_dias between 1 and 365);

-- ── Destino da notificação (o sino leva direto ao estorno) ─────────────────
alter table public.notificacoes
  add column if not exists link text;

-- ── Estornos ────────────────────────────────────────────────────────────────
create table if not exists public.ordens_pagamento_estornos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  ordem_id uuid not null references public.ordens_pagamento (id) on delete cascade,
  -- O comunicado
  data_estorno date not null,
  motivo text not null,
  arquivo_comunicado text,
  registrado_por_id uuid references public.usuarios (id),
  -- Quem lançou a ordem e vai conferir os dados
  responsavel_id uuid references public.usuarios (id),
  -- Pagamento desfeito: valor, data, comprovante, conta do débito, pagador,
  -- forma e o "pago com" da época
  pagamento jsonb not null default '{}'::jsonb,
  -- A correção
  resolvido_em timestamptz,
  resolvido_por_id uuid references public.usuarios (id),
  resolucao text,
  correcao jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ordens_pagamento_estornos_ordem_idx
  on public.ordens_pagamento_estornos (ordem_id, created_at);
create index if not exists ordens_pagamento_estornos_pendentes_idx
  on public.ordens_pagamento_estornos (emp_proprietaria_id, responsavel_id)
  where resolvido_em is null;
-- Um estorno pendente por ordem.
create unique index if not exists ordens_pagamento_estornos_um_pendente
  on public.ordens_pagamento_estornos (ordem_id)
  where resolvido_em is null;

alter table public.ordens_pagamento_estornos enable row level security;
drop policy if exists tenant_isolation on public.ordens_pagamento_estornos;
create policy tenant_isolation on public.ordens_pagamento_estornos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.ordens_pagamento_estornos to authenticated;
drop trigger if exists set_emp_from_jwt on public.ordens_pagamento_estornos;
create trigger set_emp_from_jwt before insert on public.ordens_pagamento_estornos
  for each row execute function public.set_emp_from_jwt();
