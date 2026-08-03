-- Confluir — Caixa (contas de dinheiro em espécie) — 2026-07-16
-- Executar UMA VEZ no SQL Editor do Supabase. Script idempotente.
--
-- Modelo (benchmark bancário):
--  • caixa_contas: uma conta por pessoa autorizada (responsável).
--    situacao: fechada → (aporte confirmado) → aberta → (prestar contas)
--    → prestacao_pendente → (aprovação do financeiro) → fechada.
--  • caixa_movimentacoes: o extrato. tipo: aporte (crédito; nasce
--    'pendente' e o responsável confirma o recebimento), compra (débito),
--    perda (débito lançado pelo financeiro ao resolver ocorrência),
--    acerto (débito de fechamento na aprovação da prestação).
--  • caixa_prestacoes: pedidos de prestação de contas e a decisão.
--  • caixa_ocorrencias: relatos de perda/problema com dinheiro, para
--    investigação e acompanhamento pelo financeiro.
-- Saldo = aportes confirmados − compras − perdas − acertos (derivado).

create table if not exists public.caixa_contas (
  id uuid primary key default gen_random_uuid(),
  responsavel_usuario_id uuid not null references public.usuarios (id),
  nome text not null,
  -- fechada | aberta | prestacao_pendente
  situacao text not null default 'fechada',
  ativa boolean not null default true,
  criada_por_usuario_id uuid references public.usuarios (id),
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists caixa_contas_responsavel_idx
  on public.caixa_contas (responsavel_usuario_id);

create table if not exists public.caixa_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.caixa_contas (id),
  -- aporte | compra | perda | acerto
  tipo text not null,
  -- pendente (aporte aguardando confirmação) | confirmada | cancelada
  situacao text not null default 'confirmada',
  valor numeric(15, 2) not null,
  descricao text,
  criada_por_usuario_id uuid references public.usuarios (id),
  confirmada_em timestamptz,
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists caixa_movimentacoes_conta_idx
  on public.caixa_movimentacoes (conta_id, created_at desc);

create table if not exists public.caixa_prestacoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.caixa_contas (id),
  -- aguardando | aprovada | rejeitada
  situacao text not null default 'aguardando',
  observacao text,
  observacao_financeiro text,
  saldo_declarado numeric(15, 2),
  aberta_por_usuario_id uuid references public.usuarios (id),
  decidida_por_usuario_id uuid references public.usuarios (id),
  decidida_em timestamptz,
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists caixa_prestacoes_conta_idx
  on public.caixa_prestacoes (conta_id, created_at desc);

create table if not exists public.caixa_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.caixa_contas (id),
  descricao text not null,
  valor numeric(15, 2),
  -- aberta | em_investigacao | resolvida
  situacao text not null default 'aberta',
  resolucao text,
  relatada_por_usuario_id uuid references public.usuarios (id),
  resolvida_por_usuario_id uuid references public.usuarios (id),
  resolvida_em timestamptz,
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists caixa_ocorrencias_conta_idx
  on public.caixa_ocorrencias (conta_id, created_at desc);

-- Padrão do projeto: RLS deny-all (todo acesso via servidor/service role)
alter table public.caixa_contas enable row level security;
alter table public.caixa_movimentacoes enable row level security;
alter table public.caixa_prestacoes enable row level security;
alter table public.caixa_ocorrencias enable row level security;
