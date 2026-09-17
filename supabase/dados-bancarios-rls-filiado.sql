-- Confluir — dados bancários de FILIADOS visíveis ao tenant (2026-09-17)
--
-- A política `tenant_isolation_pai` de dados_bancarios (rls-tenant-por-pai.sql)
-- nasceu quando a tabela só ligava a USUÁRIO ou FORNECEDOR. Depois,
-- filiacao-lacunas-modelo.sql trouxe `filiado_id` e 1.112 contas de filiados
-- vieram do Bubble só com ele — e a política, sem esse pai, deixou todas
-- invisíveis e impossíveis de gravar pelo cliente do tenant. Efeitos: o Pix do
-- filiado nunca era achado no reembolso de participação, e a ficha de
-- integrante de mandato não conseguia refletir nem gravar os dados bancários
-- da filiação.
--
-- Aqui a política ganha o terceiro pai possível (a filiação), mantendo os
-- dois de antes. Também atualizar a lista em rls-tenant-por-pai.sql, para uma
-- nova rodada daquele script não desfazer isto.
--
-- Idempotente. Executar UMA VEZ no SQL Editor do Supabase.

alter table public.dados_bancarios enable row level security;

drop policy if exists tenant_isolation_pai on public.dados_bancarios;

create policy tenant_isolation_pai on public.dados_bancarios
  for all to authenticated
  using (
    exists (select 1 from public.usuarios p where p.id = dados_bancarios.usuario_id and p.emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
    or exists (select 1 from public.empresa p where p.id = dados_bancarios.fornecedor_id and (p.emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid or p.id = (auth.jwt() ->> 'tenant_id')::uuid))
    or exists (select 1 from public.filiacoes p where p.id = dados_bancarios.filiado_id and p.emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  )
  with check (
    exists (select 1 from public.usuarios p where p.id = dados_bancarios.usuario_id and p.emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
    or exists (select 1 from public.empresa p where p.id = dados_bancarios.fornecedor_id and (p.emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid or p.id = (auth.jwt() ->> 'tenant_id')::uuid))
    or exists (select 1 from public.filiacoes p where p.id = dados_bancarios.filiado_id and p.emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  );

grant insert, update, delete on public.dados_bancarios to authenticated;

create index if not exists idx_dados_bancarios_filiado on public.dados_bancarios (filiado_id);
