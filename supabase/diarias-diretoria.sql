-- ═══════════════════════════════════════════════════════════════════════════
-- DIÁRIAS DA DIRETORIA, DESPESAS EXTRAS E RATEIO (2026-09-20). Idempotente.
--
-- Decisões desta rodada (Bruno, 20/09):
--  1. Diretor também recebe diária. MESMO motor das diárias de funcionário
--     (uma tabela de solicitações, uma tabela de tipos), portas separadas:
--     Pessoal lista as de funcionário, Institucional → Diretoria as da
--     diretoria, com permissão PRÓPRIA para avaliar (`diretoria_diarias`).
--  2. A diária pode levar DESPESAS EXTRAS (hospedagem, alimentação, passagem).
--     A despesa está submetida à diária, mas vai para OUTRA conta contábil.
--  3. Por isso a ordem de pagamento passa a aceitar RATEIO: uma ordem só,
--     várias linhas de centro de custo. `centro_custo_despesa_id` da ordem
--     continua sendo a conta PREDOMINANTE (a da diária), para não quebrar
--     relatório nenhum; o detalhe fica em `ordens_pagamento_rateio`.
--  4. A conta sai de TIPO DE GASTO × QUADRO × DEPARTAMENTO — é o que o plano
--     de contas da entidade já faz: "Desp. C/Desloc e Diárias Func." é uma só,
--     enquanto "Deslocamento Diretores" e "Hotel <área> Diretoria" existem
--     repetidos em cada departamento. Daí a tabela de-para
--     `pessoal_diarias_centros_custo`, configurável na tela.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Permissão própria para as diárias da diretoria ───────────────────────
-- Quem cuida de folha e ponto NÃO passa a ver nem avaliar diária de diretor.
-- `atualizarAcesso` grava todas as chaves no update, então a coluna precisa
-- existir antes do deploy da tela.

alter table public.permissoes
  add column if not exists diretoria_diarias boolean;

comment on column public.permissoes.diretoria_diarias is
  'Ver e avaliar as diárias da diretoria (Institucional → Diretoria → Diárias).';

-- ── 1. Tipos de diária: para qual quadro valem ──────────────────────────────

alter table public.financeiro_diarias
  add column if not exists quadro text not null default 'funcionario';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'financeiro_diarias_quadro_check'
  ) then
    alter table public.financeiro_diarias
      add constraint financeiro_diarias_quadro_check
      check (quadro in ('funcionario', 'diretor', 'ambos'));
  end if;
end $$;

comment on column public.financeiro_diarias.quadro is
  'Quem pode usar este tipo: funcionario | diretor | ambos. Os tipos antigos ficam como funcionario.';

-- ── 2. Solicitação: quadro, departamento, quem lançou ───────────────────────

alter table public.pessoal_diarias_solicitacoes
  add column if not exists beneficiario_tipo text not null default 'funcionario',
  add column if not exists departamento_id uuid references public.empresa_departamentos (id),
  add column if not exists solicitante_id uuid references public.usuarios (id),
  add column if not exists valor_despesas numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pessoal_diarias_solicitacoes_beneficiario_tipo_check'
  ) then
    alter table public.pessoal_diarias_solicitacoes
      add constraint pessoal_diarias_solicitacoes_beneficiario_tipo_check
      check (beneficiario_tipo in ('funcionario', 'diretor'));
  end if;
end $$;

comment on column public.pessoal_diarias_solicitacoes.beneficiario_tipo is
  'Em que condição a pessoa recebe: funcionario (Pessoal) ou diretor (Diretoria). Decide a conta e quem avalia.';
comment on column public.pessoal_diarias_solicitacoes.departamento_id is
  'Departamento que banca a atividade — dá a conta contábil da diária de diretor.';
comment on column public.pessoal_diarias_solicitacoes.solicitante_id is
  'Quem lançou, quando não foi o próprio beneficiário (a secretaria lança pelo diretor sem conta).';
comment on column public.pessoal_diarias_solicitacoes.valor_despesas is
  'Soma das despesas extras aprovadas; valor_total continua sendo só a diária.';

create index if not exists idx_diarias_solicitacoes_tipo_benef
  on public.pessoal_diarias_solicitacoes (beneficiario_tipo, created_at desc);
create index if not exists idx_diarias_solicitacoes_departamento
  on public.pessoal_diarias_solicitacoes (departamento_id);

-- ── 3. Tipos de despesa extra ───────────────────────────────────────────────

create table if not exists public.pessoal_diarias_despesa_tipos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa (id),
  nome text not null,
  descricao text,
  exige_comprovante boolean not null default true,
  ativa boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists ux_diarias_despesa_tipos_nome
  on public.pessoal_diarias_despesa_tipos (emp_proprietaria_id, lower(nome));

comment on table public.pessoal_diarias_despesa_tipos is
  'Gastos que podem acompanhar uma diária (hospedagem, alimentação, passagem). Cada um tem conta própria em pessoal_diarias_centros_custo.';

-- ── 4. Despesas extras de uma solicitação ───────────────────────────────────

create table if not exists public.pessoal_diarias_solicitacao_despesas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa (id),
  solicitacao_id uuid not null
    references public.pessoal_diarias_solicitacoes (id) on delete cascade,
  tipo_id uuid references public.pessoal_diarias_despesa_tipos (id),
  descricao text,
  valor numeric not null check (valor > 0),
  -- Arquivo no bucket `pessoal`, em diarias/<solicitacao>/<id>/comprovante.
  comprovante text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_diarias_solic_despesas_solicitacao
  on public.pessoal_diarias_solicitacao_despesas (solicitacao_id);

-- ── 5. De-para das contas: quadro × departamento × tipo de gasto ────────────
-- despesa_tipo_id NULO = a diária em si. departamento_id NULO = o padrão do
-- quadro (é o caso dos funcionários, que têm uma conta só).

create table if not exists public.pessoal_diarias_centros_custo (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa (id),
  quadro text not null check (quadro in ('funcionario', 'diretor')),
  departamento_id uuid references public.empresa_departamentos (id),
  despesa_tipo_id uuid references public.pessoal_diarias_despesa_tipos (id) on delete cascade,
  centro_custo_id uuid not null references public.centros_de_custo (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists ux_diarias_centros_custo_chave
  on public.pessoal_diarias_centros_custo (
    emp_proprietaria_id,
    quadro,
    coalesce(departamento_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(despesa_tipo_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

comment on table public.pessoal_diarias_centros_custo is
  'Conta contábil de cada gasto de diária. Busca: (quadro, departamento, tipo) → (quadro, sem departamento, tipo) → nada, e aí a ordem sai sem conta para o financeiro classificar.';

-- ── 6. Rateio da ordem de pagamento ─────────────────────────────────────────

create table if not exists public.ordens_pagamento_rateio (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa (id),
  ordem_id uuid not null references public.ordens_pagamento (id) on delete cascade,
  centro_custo_despesa_id uuid references public.centros_de_custo (id),
  departamento_id uuid references public.empresa_departamentos (id),
  descricao text,
  valor numeric not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ordens_rateio_ordem
  on public.ordens_pagamento_rateio (ordem_id, ordem);

comment on table public.ordens_pagamento_rateio is
  'Divisão de UMA ordem de pagamento entre contas contábeis. Vazio = a ordem toda é do centro_custo_despesa_id dela.';

-- ── 7. Semente dos tipos de despesa (um por tenant, idempotente) ────────────

insert into public.pessoal_diarias_despesa_tipos (emp_proprietaria_id, nome, ordem)
select t.empresa_id, d.nome, d.ordem
from public.tenants t
cross join (values
  ('Hospedagem',               1),
  ('Alimentação',              2),
  ('Passagem',                 3),
  ('Táxi ou aplicativo',       4),
  ('Pedágio e estacionamento', 5),
  ('Outra despesa',            9)
) as d(nome, ordem)
where not exists (
  select 1 from public.pessoal_diarias_despesa_tipos x
  where x.emp_proprietaria_id = t.empresa_id and lower(x.nome) = lower(d.nome)
);

-- ── 8. RLS por tenant (padrão da casa) ──────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'pessoal_diarias_despesa_tipos',
    'pessoal_diarias_solicitacao_despesas',
    'pessoal_diarias_centros_custo',
    'ordens_pagamento_rateio'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I for all to authenticated
         using (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)
         with check (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on %I', t);
    execute format('create trigger set_emp_from_jwt before insert on %I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
