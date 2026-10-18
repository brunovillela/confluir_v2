-- Confluir — Comunicação › Página de links (2026-08-31)
--
-- "Link na bio" (estilo Linktree): UMA página pública por tenant em /links,
-- com os links que a gestão configurar. Cada clique passa por /links/ir/<id>,
-- que conta e redireciona (sem identificar o visitante).
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

-- 1. Configuração da página (1 por tenant) --------------------------------------
create table if not exists comunicacao_links_config (id uuid primary key default gen_random_uuid());
alter table comunicacao_links_config add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_links_config add column if not exists titulo text;      -- fallback: nome da entidade
alter table comunicacao_links_config add column if not exists bio text;         -- frase curta sob o título
alter table comunicacao_links_config add column if not exists publicada boolean not null default true;
alter table comunicacao_links_config add column if not exists created_at timestamptz not null default now();
alter table comunicacao_links_config add column if not exists updated_at timestamptz;
create unique index if not exists ux_comunicacao_links_config_emp
  on comunicacao_links_config (emp_proprietaria_id);

-- 2. Links da página ------------------------------------------------------------
create table if not exists comunicacao_links (id uuid primary key default gen_random_uuid());
alter table comunicacao_links add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_links add column if not exists titulo text;
alter table comunicacao_links add column if not exists descricao text;          -- linha opcional sob o título
alter table comunicacao_links add column if not exists url text;
alter table comunicacao_links add column if not exists ordem integer not null default 0;
alter table comunicacao_links add column if not exists ativo boolean not null default true;
alter table comunicacao_links add column if not exists cliques integer not null default 0;
alter table comunicacao_links add column if not exists ultimo_clique timestamptz;
alter table comunicacao_links add column if not exists criado_por uuid references usuarios(id);
alter table comunicacao_links add column if not exists created_at timestamptz not null default now();
alter table comunicacao_links add column if not exists updated_at timestamptz;
create index if not exists idx_comunicacao_links_emp
  on comunicacao_links (emp_proprietaria_id, ordem);

-- 3. RLS por tenant (inline — mesmo padrão de comunicacao-qrcodes.sql) ----------
alter table comunicacao_links_config enable row level security;
drop policy if exists tenant_isolation on comunicacao_links_config;
create policy tenant_isolation on comunicacao_links_config for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_links_config to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_links_config;
create trigger set_emp_from_jwt before insert on comunicacao_links_config
  for each row execute function public.set_emp_from_jwt();

alter table comunicacao_links enable row level security;
drop policy if exists tenant_isolation on comunicacao_links;
create policy tenant_isolation on comunicacao_links for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_links to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_links;
create trigger set_emp_from_jwt before insert on comunicacao_links
  for each row execute function public.set_emp_from_jwt();
