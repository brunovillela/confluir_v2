-- Confluir — Plataforma: tenants e super-admin (Fase 0 do multi-tenant, 2026-07-24)
--
-- O Confluir vai deixar de ser "um deploy por organização" (tenant fixo no
-- .env) para "um app, vários tenants" resolvidos por subdomínio. Esta é a
-- FUNDAÇÃO: o registro dos tenants e o papel de super-admin (o controlador da
-- plataforma, acima de qualquer tenant).
--
-- Um TENANT é uma organização: o registro em `empresa` cujo id é usado como
-- `emp_proprietaria_id` em todos os dados daquela organização. A tabela
-- `tenants` guarda os dados de PLATAFORMA (slug/subdomínio, domínio próprio,
-- status, plano), separados do `empresa` operacional.
--
-- O backfill registra a organização atual (Sindipetro-NF) como o primeiro
-- tenant, com slug 'sindipetronf', para nada quebrar na virada.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Tenants (organizações servidas pela plataforma)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa (id),
  slug text not null unique,               -- subdomínio: <slug>.confluir.com.br
  dominio_custom text unique,              -- domínio próprio (opcional, fase futura)
  status text not null default 'ativo',    -- ativo | suspenso | trial
  plano text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenants_empresa_idx
  on public.tenants (empresa_id);

comment on table public.tenants is
  'Organizações servidas pela plataforma. empresa_id é o registro cujo id vira '
  'emp_proprietaria_id nos dados do tenant. slug = subdomínio de acesso.';

-- Backfill: a organização atual vira o primeiro tenant.
insert into public.tenants (empresa_id, slug, status)
values ('c763cb99-edfd-4840-8453-ed3fcb66d4a1', 'sindipetronf', 'ativo')
on conflict (empresa_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Super-admin da plataforma (o controlador — fora das permissões de tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.plataforma_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,       -- conta no Supabase Auth
  nome text,
  email text,
  created_at timestamptz not null default now()
);

comment on table public.plataforma_admins is
  'Operadores da plataforma (super-admin). Acessam /admin independentemente do '
  'tenant; NÃO são governados pelas permissões de tenant.';

-- ---------------------------------------------------------------------------
-- 3) RLS deny-all — dados só via service role no servidor (padrão do projeto)
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.plataforma_admins enable row level security;
