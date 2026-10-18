-- Confluir — Notícias (gestão) + isolamento por tenant (2026-07-25)
--
-- Fecha o lado ADMIN das notícias: até agora só havia leitura (widget do
-- painel, /portal/noticias e a página de leitura /painel/noticias/[id]). A
-- tabela `noticias` (manchete, noticia, imagem, created_at) vinha do Bubble
-- SEM emp_proprietaria_id — seria compartilhada entre tenants. Aqui ela vira
-- tenant-owned (mesmo padrão RLS das 109) e ganha uma permissão dedicada.
--
-- `noticias` está com 0 linhas (carga do Bubble não veio) → nenhum backfill.
-- Idempotente. Executar UMA VEZ no SQL Editor do Supabase.

-- 1. Tenant-scope da tabela `noticias` -----------------------------------------
alter table noticias
  add column if not exists emp_proprietaria_id uuid references empresa(id);

create index if not exists idx_noticias_emp
  on noticias (emp_proprietaria_id);

alter table noticias enable row level security;
drop policy if exists tenant_isolation on noticias;
create policy tenant_isolation on noticias
  for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on noticias to authenticated;

-- Preenche emp no insert a partir do JWT (função já criada em rls-escrita-tenant.sql).
drop trigger if exists set_emp_from_jwt on noticias;
create trigger set_emp_from_jwt
  before insert on noticias
  for each row execute function public.set_emp_from_jwt();

-- 2. Permissão dedicada `noticias` ---------------------------------------------
-- Nova coluna boolean no catálogo de permissões (gate do módulo). Concede ao(s)
-- admin(s) atual(is) — só o Bruno tem usuario_id hoje — para poder operar/testar.
alter table permissoes
  add column if not exists noticias boolean not null default false;

update permissoes set noticias = true where usuario_id is not null;
