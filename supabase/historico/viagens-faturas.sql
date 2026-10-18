-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGENS — FATURAS E RATEIO (2026-09-25). Idempotente. Roda DEPOIS de
-- supabase/viagens.sql e supabase/diarias-diretoria.sql.
--
-- A agência manda UMA fatura com vários bilhetes e diárias de hotel. A equipe
-- sobe o PDF, marca os itens que ela cobre e o sistema:
--  1. acha a conta de cada item no MESMO de-para das diárias
--     (pessoal_diarias_centros_custo: quadro × departamento × tipo de gasto,
--     com os tipos "Passagem" e "Hospedagem" que já existem);
--  2. registra uma AQUISIÇÃO DIRETA em Compras (processo + fornecimento +
--     ordem "Em autorização"), para a ordem passar pela alçada como qualquer
--     compra;
--  3. grava o rateio da ordem por centro de custo (ordens_pagamento_rateio).
-- Convidado de evento ganha quadro próprio no de-para.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Quadro "convidado" no de-para das contas ─────────────────────────────

alter table public.pessoal_diarias_centros_custo
  drop constraint if exists pessoal_diarias_centros_custo_quadro_check;
alter table public.pessoal_diarias_centros_custo
  add constraint pessoal_diarias_centros_custo_quadro_check
  check (quadro in ('funcionario', 'diretor', 'convidado'));

comment on column public.pessoal_diarias_centros_custo.quadro is
  'funcionario | diretor | convidado (convidado de evento — só passagem e hospedagem, via Viagens).';

-- ── 2. Fatura da agência ────────────────────────────────────────────────────

create table if not exists public.viagens_faturas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa (id),
  fornecedor_id uuid not null references public.empresa (id),
  numero text not null,
  emissao date not null,
  vencimento date,
  forma_pagamento text,
  departamento_id uuid references public.empresa_departamentos (id),
  valor_itens numeric not null check (valor_itens >= 0),
  -- Taxa de emissão/serviço da agência, rateada na proporção dos itens.
  valor_taxas numeric not null default 0 check (valor_taxas >= 0),
  valor_total numeric not null check (valor_total > 0),
  -- PDF no bucket `compras`, em viagens/faturas/<...>.pdf
  arquivo text not null,
  observacao text,
  processo_compra_id uuid references public.compras_solicitacoes (id) on delete set null,
  ordem_pagamento_id uuid references public.ordens_pagamento (id) on delete set null,
  criado_por uuid references public.usuarios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists ux_viagens_faturas_numero
  on public.viagens_faturas (emp_proprietaria_id, fornecedor_id, lower(numero));
create index if not exists idx_viagens_faturas_emp
  on public.viagens_faturas (emp_proprietaria_id, emissao desc);

comment on table public.viagens_faturas is
  'Fatura de agência/operadora que cobre itens de viagem. Vira aquisição direta em Compras e ordem de pagamento com rateio.';

-- ── 3. Item: em que fatura foi cobrado e em que conta ───────────────────────

alter table public.viagens_itens
  add column if not exists fatura_id uuid references public.viagens_faturas (id) on delete set null,
  add column if not exists centro_custo_id uuid references public.centros_de_custo (id);

create index if not exists idx_viagens_itens_fatura
  on public.viagens_itens (fatura_id);

comment on column public.viagens_itens.centro_custo_id is
  'Conta em que o item foi faturado (a sugerida pelo de-para ou a escolhida na fatura).';

-- ── 4. RLS por tenant (padrão da casa) ──────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['viagens_faturas'] loop
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
