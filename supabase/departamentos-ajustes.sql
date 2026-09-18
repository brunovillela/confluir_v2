-- ============================================================================
-- Departamentos: integrantes legíveis e departamento legado (2026-09-18).
-- Idempotente — rodar no SQL Editor.
--
-- • CORREÇÃO: empresa_departamentos_integrantes não tinha política de RLS para
--   o tenant. O vínculo era gravado, mas o sistema não conseguia lê-lo — ao
--   salvar, as pessoas "sumiam" do departamento. Ganha a política por PAI
--   (departamento do tenant), como as de rls-tenant-por-pai.sql.
-- • LEGADO (pedido do Bruno): o departamento não é apagado — compras, ofícios e
--   contas apontam para ele. Depois de retiradas as pessoas e o coordenador,
--   ele vira legado: sai das listas de escolha e segue nos registros antigos.
-- ============================================================================

alter table public.empresa_departamentos_integrantes enable row level security;
drop policy if exists tenant_isolation_pai on public.empresa_departamentos_integrantes;
create policy tenant_isolation_pai on public.empresa_departamentos_integrantes for all to authenticated
  using (exists (select 1 from public.empresa_departamentos p
                 where p.id = empresa_departamentos_integrantes.departamento_id
                   and p.emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid))
  with check (exists (select 1 from public.empresa_departamentos p
                 where p.id = empresa_departamentos_integrantes.departamento_id
                   and p.emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid));
grant select, insert, update, delete on public.empresa_departamentos_integrantes to authenticated;

alter table empresa_departamentos add column if not exists legado boolean not null default false;
alter table empresa_departamentos add column if not exists legado_em timestamptz;
comment on column empresa_departamentos.legado is
  'Departamento desativado: fora das listas de escolha, mantido nos registros antigos (compras, ofícios, contas).';

notify pgrst, 'reload schema';
