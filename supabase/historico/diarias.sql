-- ═══════════════════════════════════════════════════════════════════════════
-- DIÁRIAS — tipos e solicitações (rodar no SQL Editor do Supabase)
--
-- Modelo: o funcionário SOLICITA uma diária (ex.: viagem ao Rio com
-- pernoite); um avaliador com permissão (pessoal_gestao ou pessoal_diarias)
-- aprova ou reprova; a aprovação gera uma ordem de pagamento direta ao
-- funcionário (paga a qualquer tempo, fora da folha).
--
-- Tipos: reusa a tabela migrada `financeiro_diarias` (veio vazia do Bubble;
-- `diaria` é enum legado Nacional/Internacional/Local/Outro). Ganha `nome`
-- livre e `ativa` para o CRUD da gestão.
-- ═══════════════════════════════════════════════════════════════════════════

alter table financeiro_diarias
  add column if not exists nome text,
  add column if not exists ativa boolean not null default true,
  add column if not exists emp_proprietaria_id uuid references empresa(id);

create table if not exists pessoal_diarias_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references empresa(id),
  funcionario_id uuid not null references usuarios(id),
  diaria_id uuid not null references financeiro_diarias(id),
  quantidade numeric not null default 1 check (quantidade > 0),
  motivo text not null,
  data_inicio date,
  data_termino date,
  situacao text not null default 'aguardando'
    check (situacao in ('aguardando', 'aprovada', 'reprovada', 'cancelada')),
  -- Snapshot do valor no momento da solicitação (a base pode mudar depois).
  valor_unitario numeric,
  valor_total numeric,
  avaliador_id uuid references usuarios(id),
  avaliacao_data timestamptz,
  avaliacao_observacao text,
  ordem_pagamento_id uuid references ordens_pagamento(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diarias_solicitacoes_funcionario
  on pessoal_diarias_solicitacoes (funcionario_id, created_at desc);
create index if not exists idx_diarias_solicitacoes_situacao
  on pessoal_diarias_solicitacoes (situacao, created_at desc);

-- Padrão do projeto: RLS deny-all — dados só via service role no servidor.
alter table financeiro_diarias enable row level security;
alter table pessoal_diarias_solicitacoes enable row level security;
