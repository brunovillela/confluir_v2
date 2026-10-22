-- Confluir — Fechamento do mês contábil (Financeiro › Exportação contábil)
--
-- POR QUÊ: o centro de custo da ordem é decisão técnica do Financeiro, que
-- precisa reclassificá-lo (centro, departamento e rateio) também depois do
-- pagamento. Até quando? Até a contabilidade receber o mês: depois disso,
-- mexer na classificação desencontra o que o sistema mostra do que foi
-- escriturado. Não havia marco nenhum — a exportação é gerada na hora.
--
-- COMO: financeiro_meses_fechados — um registro por mês fechado (pela data do
-- pagamento das ordens, a mesma régua da exportação). Reabrir não apaga:
-- grava quem reabriu e o motivo; fechar de novo cria outro registro, e o
-- histórico fica. Só um fechamento vigente por mês (índice parcial).
-- Prefixo financeiro_: módulo Financeiro do dicionário e processo LGPD do
-- Financeiro. RLS por tenant, como as demais.

create table if not exists public.financeiro_meses_fechados (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  mes date not null,
  fechado_em timestamptz not null default now(),
  fechado_por_usuario_id uuid references public.usuarios(id),
  observacao text,
  reaberto_em timestamptz,
  reaberto_por_usuario_id uuid references public.usuarios(id),
  motivo_reabertura text,
  created_at timestamptz not null default now(),
  constraint financeiro_meses_fechados_mes_check check (extract(day from mes) = 1)
);

create unique index if not exists financeiro_meses_fechados_vigente_idx
  on public.financeiro_meses_fechados (emp_proprietaria_id, mes) where reaberto_em is null;

alter table public.financeiro_meses_fechados enable row level security;
drop policy if exists tenant_isolation on public.financeiro_meses_fechados;
create policy tenant_isolation on public.financeiro_meses_fechados to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.financeiro_meses_fechados;
create trigger set_emp_from_jwt before insert on public.financeiro_meses_fechados
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.financeiro_meses_fechados from public, anon;
grant select, insert, update, delete on table public.financeiro_meses_fechados to authenticated;
grant all on table public.financeiro_meses_fechados to service_role;

-- ── Dicionário ─────────────────────────────────────────────────────────────

comment on table public.financeiro_meses_fechados is 'Meses fechados para a contabilidade (pela data do pagamento das ordens). Mês fechado trava a reclassificação do centro de custo, do departamento e do rateio das ordens pagas nele. Reabrir grava quem e por quê; fechar de novo cria outro registro. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.financeiro_meses_fechados.mes is 'Primeiro dia do mês fechado.';
comment on column public.financeiro_meses_fechados.fechado_em is 'Quando o mês foi fechado.';
comment on column public.financeiro_meses_fechados.fechado_por_usuario_id is 'Quem fechou o mês. [lgpd:identificacao]';
comment on column public.financeiro_meses_fechados.observacao is 'Observação do fechamento (ex.: enviado à contabilidade em 05/11).';
comment on column public.financeiro_meses_fechados.reaberto_em is 'Quando o fechamento foi desfeito; nulo = fechamento vigente.';
comment on column public.financeiro_meses_fechados.reaberto_por_usuario_id is 'Quem reabriu o mês. [lgpd:identificacao]';
comment on column public.financeiro_meses_fechados.motivo_reabertura is 'Por que o mês foi reaberto.';
comment on column public.financeiro_meses_fechados.created_at is 'Criação do registro.';
