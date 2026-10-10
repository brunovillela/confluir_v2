-- ===========================================================================
-- Confluir — juridico_configuracoes por tenant (2026-10-10)
-- ===========================================================================
-- A tabela nasceu global (sem emp_proprietaria_id) e com RLS ligado sem
-- policy. Como o createAdminClient LÊ pelo JWT do tenant, a leitura voltava
-- sempre vazia: o centro de custo dos reembolsos do jurídico nunca aparecia,
-- cada "salvar" criava uma linha nova e avaliarReembolso nunca o aplicava.
-- Além disso, uma linha só valeria para todas as entidades.
--
-- Agora: uma linha por tenant, padrão da casa (tenant_isolation + grant +
-- set_emp_from_jwt). Em 10/10 a tabela tinha 0 linhas — nada a migrar.
-- Depois de rodar, o app passa a listar a tabela em TABELAS_TENANT.
--
-- Idempotente. Executar UMA VEZ no SQL Editor do Supabase.
-- ===========================================================================

alter table public.juridico_configuracoes
  add column if not exists emp_proprietaria_id uuid;

-- Linhas sem dono (se alguém salvou antes desta correção) ficariam invisíveis
-- para sempre; só fecha o NOT NULL se não houver nenhuma.
do $$
begin
  if not exists (select 1 from public.juridico_configuracoes where emp_proprietaria_id is null) then
    alter table public.juridico_configuracoes alter column emp_proprietaria_id set not null;
  else
    raise notice 'juridico_configuracoes tem linhas sem emp_proprietaria_id — preencher e rodar de novo';
  end if;
end $$;

create unique index if not exists uq_juridico_configuracoes_emp
  on public.juridico_configuracoes (emp_proprietaria_id);

-- ── RLS por tenant ───────────────────────────────────────────────────────────

alter table public.juridico_configuracoes enable row level security;
drop policy if exists tenant_isolation on public.juridico_configuracoes;
create policy tenant_isolation on public.juridico_configuracoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.juridico_configuracoes to authenticated;
drop trigger if exists set_emp_from_jwt on public.juridico_configuracoes;
create trigger set_emp_from_jwt before insert on public.juridico_configuracoes
  for each row execute function public.set_emp_from_jwt();

comment on table public.juridico_configuracoes is
  'Configuração do jurídico, uma linha por tenant: centro de custo padrão das ordens de reembolso.';

notify pgrst, 'reload schema';

-- Conferência:
-- select column_name, is_nullable from information_schema.columns
--  where table_name = 'juridico_configuracoes';             -- emp_proprietaria_id NO
-- select policyname from pg_policies
--  where tablename = 'juridico_configuracoes';              -- tenant_isolation
