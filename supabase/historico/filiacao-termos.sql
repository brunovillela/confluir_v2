-- Confluir — Termos legais de filiação POR TENANT (2026-07-31)
--
-- As tabelas de termos (LGPD e autorização de desconto) vieram do Bubble como
-- GLOBAIS (sem emp_proprietaria_id). Cada tenant tem os seus textos, então
-- adicionamos o dono e fazemos backfill das linhas atuais para o tenant único.
--
-- Depois deste script, RE-RODAR supabase/rls-emp-todas.sql (data-driven) para
-- aplicar tenant_isolation + grant + trigger set_emp_from_jwt nas duas tabelas.

alter table public.filiacao_tl_lgpd
  add column if not exists emp_proprietaria_id uuid references public.empresa(id);
alter table public.filiacao_tl_desconto
  add column if not exists emp_proprietaria_id uuid references public.empresa(id);

-- Backfill: as linhas migradas são do tenant atual (registro único em `tenants`).
update public.filiacao_tl_lgpd
  set emp_proprietaria_id = (select empresa_id from public.tenants order by created_at limit 1)
  where emp_proprietaria_id is null;
update public.filiacao_tl_desconto
  set emp_proprietaria_id = (select empresa_id from public.tenants order by created_at limit 1)
  where emp_proprietaria_id is null;

create index if not exists idx_filiacao_tl_lgpd_emp
  on public.filiacao_tl_lgpd (emp_proprietaria_id);
create index if not exists idx_filiacao_tl_desconto_emp
  on public.filiacao_tl_desconto (emp_proprietaria_id);

-- APÓS este script: re-rodar supabase/rls-emp-todas.sql.
