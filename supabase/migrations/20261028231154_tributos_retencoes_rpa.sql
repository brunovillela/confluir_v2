-- Confluir — Retenções do RPA nas guias de Tributos (28/10/2026)
--
-- POR QUÊ: o RPA retém INSS (11%), IRRF e ISS do autônomo, e a entidade ainda
-- deve o INSS patronal (20% sobre o bruto). Esses valores não chegavam a
-- lugar nenhum: a guia do mês era lançada sem saber quanto deveria somar.
-- Decisões do usuário: competência pelo PAGAMENTO da ordem do RPA; incluir os
-- 20% patronais; o sistema cria os tributos que recebem as retenções.
--
-- COMO:
--   1. financeiro_tributos.retencao_rpa — qual retenção do RPA o tributo
--      recebe (inss, irrf, iss); no máximo um tributo por retenção e tenant.
--   2. financeiro_tributos_retencoes — uma linha por RPA pago e tipo
--      (inss_retido, inss_patronal, irrf, iss), na competência do pagamento.
--      A guia da competência passa a esperar a soma delas.
--   3. compras_rpa_config.inss_patronal_aliquota — a cota da entidade (20%).
--   Idempotente.

-- ── 1. O tributo que recebe cada retenção ─────────────────────────────────

alter table public.financeiro_tributos add column if not exists retencao_rpa text;
alter table public.financeiro_tributos drop constraint if exists financeiro_tributos_retencao_rpa_check;
alter table public.financeiro_tributos
  add constraint financeiro_tributos_retencao_rpa_check check (retencao_rpa is null or retencao_rpa in ('inss', 'irrf', 'iss'));
create unique index if not exists financeiro_tributos_retencao_rpa_idx
  on public.financeiro_tributos (emp_proprietaria_id, retencao_rpa) where retencao_rpa is not null;

-- ── 2. As retenções por RPA pago ───────────────────────────────────────────

create table if not exists public.financeiro_tributos_retencoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  tributo_id uuid not null references public.financeiro_tributos(id) on delete cascade,
  rpa_id uuid not null references public.compras_rpa(id) on delete cascade,
  ordem_pagamento_id uuid references public.ordens_pagamento(id) on delete set null,
  tipo text not null,
  competencia date not null,
  base numeric(12,2),
  aliquota numeric(6,2),
  valor numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_tributos_retencoes_tipo_check check (tipo in ('inss_retido', 'inss_patronal', 'irrf', 'iss'))
);

create unique index if not exists financeiro_tributos_retencoes_rpa_tipo_idx
  on public.financeiro_tributos_retencoes (rpa_id, tipo);
create index if not exists financeiro_tributos_retencoes_competencia_idx
  on public.financeiro_tributos_retencoes (tributo_id, competencia);
create index if not exists financeiro_tributos_retencoes_tenant_idx
  on public.financeiro_tributos_retencoes (emp_proprietaria_id, competencia);

alter table public.financeiro_tributos_retencoes enable row level security;
drop policy if exists tenant_isolation on public.financeiro_tributos_retencoes;
create policy tenant_isolation on public.financeiro_tributos_retencoes to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.financeiro_tributos_retencoes;
create trigger set_emp_from_jwt before insert on public.financeiro_tributos_retencoes
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.financeiro_tributos_retencoes from public, anon;
grant select, insert, update, delete on table public.financeiro_tributos_retencoes to authenticated;
grant all on table public.financeiro_tributos_retencoes to service_role;

-- ── 3. A cota patronal do INSS ─────────────────────────────────────────────

alter table public.compras_rpa_config add column if not exists inss_patronal_aliquota numeric(5,2) not null default 20;

-- ── Dicionário ─────────────────────────────────────────────────────────────

comment on column public.financeiro_tributos.retencao_rpa is 'Retenção do RPA que este tributo recebe: inss (11% retido + 20% patronal), irrf ou iss. Criado pelo sistema; um por tenant.';
comment on table public.financeiro_tributos_retencoes is 'Retenções de cada RPA pago, na competência do pagamento, no tributo que as recolhe (INSS retido e patronal, IRRF, ISS). A guia da competência espera a soma delas. [lgpd:financeiro|titulares:fornecedores PF]';
comment on column public.financeiro_tributos_retencoes.rpa_id is 'RPA que originou a retenção (o prestador é o fornecedor dele).';
comment on column public.financeiro_tributos_retencoes.ordem_pagamento_id is 'Ordem do líquido do RPA, cujo pagamento define a competência.';
comment on column public.financeiro_tributos_retencoes.tipo is 'inss_retido (do prestador), inss_patronal (cota da entidade), irrf ou iss.';
comment on column public.financeiro_tributos_retencoes.competencia is 'Primeiro dia do mês do pagamento da ordem do RPA.';
comment on column public.financeiro_tributos_retencoes.base is 'Base de cálculo: o valor bruto do RPA. [lgpd:financeiro]';
comment on column public.financeiro_tributos_retencoes.aliquota is 'Alíquota em % (patronal e ISS); nula quando segue tabela (IRRF) ou teto (INSS retido).';
comment on column public.financeiro_tributos_retencoes.valor is 'Valor retido ou devido. [lgpd:financeiro]';
comment on column public.compras_rpa_config.inss_patronal_aliquota is 'Cota patronal do INSS sobre o bruto do RPA (20%), devida pela entidade e somada na guia do INSS.';
