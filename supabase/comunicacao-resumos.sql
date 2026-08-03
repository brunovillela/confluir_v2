-- Confluir — Comunicação: Resumo de notícias por IA (2026-08-01)
--
-- A IA lê sites indicados (comunicacao_fontes), numa recorrência configurada
-- (comunicacao_resumo_config), e gera um resumo com título chamativo exibido no
-- painel principal; o histórico fica em comunicacao_resumos. Tudo tenant-owned.
-- Depois deste script, RE-RODAR supabase/rls-emp-todas.sql (aplica RLS/grant/
-- trigger set_emp_from_jwt às 3 tabelas novas, todas com emp_proprietaria_id).

-- 1. Configuração (1 linha por tenant) --------------------------------------
create table if not exists public.comunicacao_resumo_config (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa(id),
  ativo boolean not null default false,
  -- Recorrência por presets simples.
  frequencia text not null default 'diaria'
    check (frequencia in ('diaria', 'dias_uteis', 'semanal', 'horas')),
  hora time,                    -- diaria/dias_uteis/semanal
  dia_semana int check (dia_semana between 0 and 6),  -- semanal (0=domingo)
  intervalo_horas int,          -- frequencia 'horas'
  tamanho int not null default 2000 check (tamanho in (1000, 2000, 3000)),
  prompt text,                  -- instrução editorial da IA (default no app)
  ultima_geracao timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (emp_proprietaria_id)
);

-- 2. Fontes (sites que a IA lê) ---------------------------------------------
create table if not exists public.comunicacao_fontes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa(id),
  url text not null,
  nome text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_comunicacao_fontes_emp
  on public.comunicacao_fontes (emp_proprietaria_id);

-- 3. Resumos gerados (histórico) --------------------------------------------
create table if not exists public.comunicacao_resumos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa(id),
  titulo text,
  resumo text,
  tamanho int,
  origem text check (origem in ('manual', 'agendador')),
  fontes_url text[],
  created_at timestamptz not null default now()
);
create index if not exists idx_comunicacao_resumos_emp
  on public.comunicacao_resumos (emp_proprietaria_id, created_at desc);

-- APÓS este script: re-rodar supabase/rls-emp-todas.sql.
