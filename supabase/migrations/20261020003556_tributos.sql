-- Confluir — Tributos (Financeiro › Tributos), fase 1 de docs/plano-tributos.md
--
-- POR QUÊ: o Bubble tinha a área de tributos (tipos `tributos-configurações` e
-- `tributos-lançamentos`, e o campo TRIBUTO na ordem). As 109 ordens de
-- tributo migraram, mas o cadastro e os lançamentos não: a ordem ficou só com
-- o texto do tipo e o vínculo ordem → guia → tributo se perdeu. Desde a virada
-- nenhuma ordem de tributo nasceu no sistema novo. A área volta no molde dos
-- Contratos: o tributo está para o contrato como a guia para a parcela.
--
-- COMO:
--   1. financeiro_tributos — o cadastro (órgão, centro de custo, periodicidade,
--      vencimento habitual, valor esperado para a dispensa de autorização).
--   2. financeiro_tributos_lancamentos — uma guia por competência: prevista
--      ("aguardando_guia"), lançada (gerou a ordem) ou cancelada.
--   3. ordens_pagamento.tributo_lancamento_id — a ordem paga a guia (como
--      contrato_id na parcela de contrato).
--   Prefixo financeiro_: entra no módulo Financeiro do dicionário e no
--   processo LGPD do Financeiro. RLS por tenant, como as demais.

-- ── 1. Cadastro ─────────────────────────────────────────────────────────────

create table if not exists public.financeiro_tributos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  nome text not null,
  abreviacao text,
  esfera text not null default 'federal',
  beneficiario_empresa_id uuid references public.empresa(id),
  centro_custo_despesa_id uuid references public.centros_de_custo(id),
  departamento_id uuid references public.empresa_departamentos(id),
  periodicidade text not null default 'mensal',
  dia_vencimento smallint,
  valor_esperado numeric(12,2),
  forma_pagamento text,
  ativo boolean not null default true,
  observacoes text,
  criado_por_usuario_id uuid references public.usuarios(id),
  bubble_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_tributos_esfera_check check (esfera in ('federal', 'estadual', 'municipal', 'trabalhista')),
  constraint financeiro_tributos_periodicidade_check check (periodicidade in ('mensal', 'anual', 'eventual')),
  constraint financeiro_tributos_dia_check check (dia_vencimento is null or dia_vencimento between 1 and 31)
);

create unique index if not exists financeiro_tributos_bubble_idx
  on public.financeiro_tributos (bubble_id) where bubble_id is not null;
create index if not exists financeiro_tributos_tenant_idx
  on public.financeiro_tributos (emp_proprietaria_id, ativo);

-- ── 2. Lançamentos (guias por competência) ─────────────────────────────────

create table if not exists public.financeiro_tributos_lancamentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  tributo_id uuid not null references public.financeiro_tributos(id) on delete cascade,
  competencia_inicio date,
  competencia_fim date,
  valor numeric(12,2),
  vencimento date,
  arquivo_guia text,
  linha_digitavel text,
  situacao text not null default 'aguardando_guia',
  ordem_pagamento_id uuid references public.ordens_pagamento(id) on delete set null,
  criado_por_usuario_id uuid references public.usuarios(id),
  bubble_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_tributos_lancamentos_situacao_check check (situacao in ('aguardando_guia', 'lancado', 'cancelado'))
);

create unique index if not exists financeiro_tributos_lancamentos_bubble_idx
  on public.financeiro_tributos_lancamentos (bubble_id) where bubble_id is not null;
create index if not exists financeiro_tributos_lancamentos_tributo_idx
  on public.financeiro_tributos_lancamentos (tributo_id, competencia_inicio desc);
create index if not exists financeiro_tributos_lancamentos_tenant_idx
  on public.financeiro_tributos_lancamentos (emp_proprietaria_id, situacao, vencimento);

-- ── 3. A ordem paga a guia ─────────────────────────────────────────────────

alter table public.ordens_pagamento
  add column if not exists tributo_lancamento_id uuid references public.financeiro_tributos_lancamentos(id) on delete set null;
create index if not exists ordens_pagamento_tributo_lancamento_idx
  on public.ordens_pagamento (tributo_lancamento_id) where tributo_lancamento_id is not null;

-- ── RLS, gatilho do tenant e privilégios ───────────────────────────────────

alter table public.financeiro_tributos enable row level security;
drop policy if exists tenant_isolation on public.financeiro_tributos;
create policy tenant_isolation on public.financeiro_tributos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.financeiro_tributos;
create trigger set_emp_from_jwt before insert on public.financeiro_tributos
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.financeiro_tributos from public, anon;
grant select, insert, update, delete on table public.financeiro_tributos to authenticated;
grant all on table public.financeiro_tributos to service_role;

alter table public.financeiro_tributos_lancamentos enable row level security;
drop policy if exists tenant_isolation on public.financeiro_tributos_lancamentos;
create policy tenant_isolation on public.financeiro_tributos_lancamentos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.financeiro_tributos_lancamentos;
create trigger set_emp_from_jwt before insert on public.financeiro_tributos_lancamentos
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.financeiro_tributos_lancamentos from public, anon;
grant select, insert, update, delete on table public.financeiro_tributos_lancamentos to authenticated;
grant all on table public.financeiro_tributos_lancamentos to service_role;

-- ── Dicionário ─────────────────────────────────────────────────────────────

comment on table public.financeiro_tributos is 'Tributos da entidade (DARF, FGTS, GPS, IPTU, alvará, DUDA…): o cadastro, como o contrato — órgão beneficiário, centro de custo, periodicidade e vencimento habitual. Cada competência é uma guia em financeiro_tributos_lancamentos. Migrado de tributos-configurações do Bubble. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.financeiro_tributos.nome is 'Nome do tributo (ex.: Fundo de Garantia do Tempo de Serviço).';
comment on column public.financeiro_tributos.abreviacao is 'Como a equipe chama o tributo (ex.: FGTS, DARF GERAL, DAM CAMPOS).';
comment on column public.financeiro_tributos.esfera is 'federal, estadual, municipal ou trabalhista (trabalhista e previdenciário).';
comment on column public.financeiro_tributos.beneficiario_empresa_id is 'Órgão que recebe (empresa): Receita Federal, CEF (FGTS), INSS, prefeitura, Detran. Vira o favorecido da ordem.';
comment on column public.financeiro_tributos.centro_custo_despesa_id is 'Centro de custo da despesa herdado pelas ordens.';
comment on column public.financeiro_tributos.departamento_id is 'Departamento herdado pelas ordens (opcional).';
comment on column public.financeiro_tributos.periodicidade is 'mensal (gera as competências previstas), anual ou eventual.';
comment on column public.financeiro_tributos.dia_vencimento is 'Dia habitual de vencimento da guia (1–31), para as competências previstas.';
comment on column public.financeiro_tributos.valor_esperado is 'Valor esperado da guia. Tributo recorrente com guia nesse valor tem a autorização dispensada; fora dele, passa pela alçada.';
comment on column public.financeiro_tributos.forma_pagamento is 'Forma padrão das ordens (Boleto para guias com código de barras; Pix).';
comment on column public.financeiro_tributos.ativo is 'Desativado: sai das listas e não gera competências novas; o histórico fica.';
comment on column public.financeiro_tributos.observacoes is 'Observações livres do Financeiro.';
comment on column public.financeiro_tributos.criado_por_usuario_id is 'Quem cadastrou. [lgpd:identificacao]';
comment on column public.financeiro_tributos.bubble_id is 'Id do registro em tributos-configurações no Bubble (migração).';
comment on column public.financeiro_tributos.created_at is 'Criação do registro.';
comment on column public.financeiro_tributos.updated_at is 'Última alteração.';

comment on table public.financeiro_tributos_lancamentos is 'Guias dos tributos, uma por competência (como a parcela do contrato): prevista, lançada — com a ordem de pagamento — ou cancelada. Migrado de tributos-lançamentos do Bubble. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.financeiro_tributos_lancamentos.tributo_id is 'Tributo da guia.';
comment on column public.financeiro_tributos_lancamentos.competencia_inicio is 'Início do período a que a guia se refere (a "vigência início" do legado).';
comment on column public.financeiro_tributos_lancamentos.competencia_fim is 'Fim do período a que a guia se refere.';
comment on column public.financeiro_tributos_lancamentos.valor is 'Valor da guia.';
comment on column public.financeiro_tributos_lancamentos.vencimento is 'Vencimento da guia (previsto pelo dia habitual até a guia chegar).';
comment on column public.financeiro_tributos_lancamentos.arquivo_guia is 'Caminho do PDF/foto da guia no bucket compras (guias-tributos/...).';
comment on column public.financeiro_tributos_lancamentos.linha_digitavel is 'Linha digitável / código de barras da guia (para remessa bancária).';
comment on column public.financeiro_tributos_lancamentos.situacao is 'aguardando_guia (prevista), lancado (a guia gerou a ordem) ou cancelado.';
comment on column public.financeiro_tributos_lancamentos.ordem_pagamento_id is 'Ordem de pagamento da guia.';
comment on column public.financeiro_tributos_lancamentos.criado_por_usuario_id is 'Quem lançou a guia. [lgpd:identificacao]';
comment on column public.financeiro_tributos_lancamentos.bubble_id is 'Id do registro em tributos-lançamentos no Bubble (migração).';
comment on column public.financeiro_tributos_lancamentos.created_at is 'Criação do registro.';
comment on column public.financeiro_tributos_lancamentos.updated_at is 'Última alteração.';

comment on column public.ordens_pagamento.tributo_lancamento_id is 'Guia de tributo que a ordem paga (financeiro_tributos_lancamentos), como contrato_id na parcela de contrato.';
