-- Confluir — Acordos Coletivos (Representação Sindical, Fase B) (2026-07-25)
--
-- Acompanhamento de ACT (Acordo Coletivo, com empregador/fonte pagadora) e CCT
-- (Convenção Coletiva, da categoria): vigência, abrangência, cláusulas
-- estruturadas e alertas de vencimento. Tenant-owned.
--
-- APÓS este script: RE-RODAR supabase/rls-emp-todas.sql (aplica tenant_isolation
-- + grant + trigger nas 3 tabelas novas, todas com emp_proprietaria_id).

create table if not exists public.acordo_coletivo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'act' check (tipo in ('act', 'cct')),
  titulo text,
  numero_registro text,          -- nº de registro no MTE, se houver
  data_base text,                -- mês-base da categoria (ex.: "Setembro")
  vigencia_inicio date,
  vigencia_fim date,
  abrangencia text,              -- base territorial / categorias cobertas
  situacao text not null default 'em_negociacao'
    check (situacao in ('em_negociacao', 'vigente', 'arquivado')),
  documento_url text,
  observacoes text,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_acordo_emp on public.acordo_coletivo (emp_proprietaria_id);
create index if not exists idx_acordo_vigencia on public.acordo_coletivo (vigencia_fim);

-- Empregadores/fontes pagadoras do ACT (CCT pode não ter fonte específica).
create table if not exists public.acordo_fontes (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid references public.acordo_coletivo(id) on delete cascade,
  empresa_id uuid references public.empresa(id),
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  unique (acordo_id, empresa_id)
);
create index if not exists idx_acordo_fontes_acordo on public.acordo_fontes (acordo_id);

-- Cláusulas estruturadas (pesquisáveis).
create table if not exists public.acordo_clausulas (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid references public.acordo_coletivo(id) on delete cascade,
  numero text,
  titulo text,
  texto text,
  categoria text not null default 'outro'
    check (categoria in ('reajuste','beneficio','jornada','saude','seguranca','outro')),
  ordem integer not null default 0,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_acordo_clausulas_acordo on public.acordo_clausulas (acordo_id);
