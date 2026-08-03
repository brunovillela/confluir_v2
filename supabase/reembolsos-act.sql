-- ═══════════════════════════════════════════════════════════════════════════
-- REEMBOLSOS DO ACT — tipos e lançamentos (rodar no SQL Editor do Supabase)
--
-- Modelo: o ACORDO COLETIVO aprova tipos de reembolso (ex.: auxílio creche,
-- ótica, educação) com teto opcional por solicitação. O funcionário SOLICITA
-- com comprovante; a gestão de pessoal aprova (definindo o valor e a
-- referência do contracheque) ou reprova; o pagamento acontece NO
-- CONTRACHEQUE — quando entra na folha, a gestão marca como pago.
--
-- Não há tabela correspondente migrada do Bubble — estas são novas.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists pessoal_reembolsos_act_tipos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references empresa(id),
  nome text not null,
  descricao text,
  -- Teto por solicitação previsto no ACT (null = sem teto).
  valor_limite numeric check (valor_limite is null or valor_limite > 0),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pessoal_reembolsos_act (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references empresa(id),
  funcionario_id uuid not null references usuarios(id),
  tipo_id uuid not null references pessoal_reembolsos_act_tipos(id),
  valor_solicitado numeric not null check (valor_solicitado > 0),
  valor_aprovado numeric check (valor_aprovado is null or valor_aprovado > 0),
  descricao text not null,
  comprovante_url text,
  situacao text not null default 'aguardando'
    check (situacao in ('aguardando', 'aprovado', 'reprovado', 'cancelado', 'pago')),
  avaliador_id uuid references usuarios(id),
  avaliacao_data timestamptz,
  avaliacao_observacao text,
  -- Referência do contracheque em que o reembolso entra (ex.: Julho/2026).
  pagamento_mes text,
  pagamento_ano text,
  pago_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reembolsos_act_funcionario
  on pessoal_reembolsos_act (funcionario_id, created_at desc);
create index if not exists idx_reembolsos_act_situacao
  on pessoal_reembolsos_act (situacao, created_at desc);

-- Padrão do projeto: RLS deny-all — dados só via service role no servidor.
alter table pessoal_reembolsos_act_tipos enable row level security;
alter table pessoal_reembolsos_act enable row level security;
