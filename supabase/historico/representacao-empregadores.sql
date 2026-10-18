-- Confluir — Empregadores em Representação + Doc. legal + Registro MTE (2026-07-26)
--
-- (1) Permissões novas `empregadores` e `registro_mte` (área Representação
--     Sindical). A gestão de empregadores/fontes pagadoras saiu de Filiados.
-- (2) representacao_documentos: documentação legal por empregador (uma linha de
--     `empresa`) — cartas, atas, editais, procurações etc.
-- (3) registro_sindical: registros da PRÓPRIA entidade no MTE.
--
-- APÓS este script: RE-RODAR supabase/rls-emp-todas.sql (aplica tenant_isolation
-- + grant + trigger set_emp_from_jwt nas 2 tabelas novas, com emp_proprietaria_id).

-- 1) Permissões -------------------------------------------------------------
alter table public.permissoes
  add column if not exists empregadores boolean not null default false;
alter table public.permissoes
  add column if not exists registro_mte boolean not null default false;
-- Concede aos admin(s) atuais (só o Bruno tem usuario_id hoje) — padrão dos
-- módulos anteriores. A importação de filiados segue sob `filiacao_gestao`.
update public.permissoes
  set empregadores = true, registro_mte = true
  where usuario_id is not null;

-- 2) Documentação legal do empregador ---------------------------------------
create table if not exists public.representacao_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresa(id) on delete cascade,
  tipo text not null default 'outro'
    check (tipo in ('carta_sindical','ata','edital','procuracao','acordo','outro')),
  titulo text,
  numero text,
  data_documento date,
  vigencia_fim date,             -- opcional (p/ alerta futuro)
  arquivo_url text,              -- caminho no bucket privado `representacao`
  observacoes text,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_rep_docs_empresa
  on public.representacao_documentos (empresa_id);
create index if not exists idx_rep_docs_emp
  on public.representacao_documentos (emp_proprietaria_id);

-- 3) Registro sindical da entidade no MTE -----------------------------------
create table if not exists public.registro_sindical (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'registro_sindical'
    check (tipo in ('registro_sindical','cnes','carta_sindical')),
  numero text,                   -- nº do processo / registro
  categoria text,                -- categoria representada
  abrangencia text,              -- base territorial
  data_registro date,
  data_publicacao date,          -- publicação no DOU
  situacao text not null default 'ativo'
    check (situacao in ('ativo','em_analise','cancelado')),
  documento_url text,            -- caminho no bucket privado `representacao`
  observacoes text,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_registro_sindical_emp
  on public.registro_sindical (emp_proprietaria_id);
