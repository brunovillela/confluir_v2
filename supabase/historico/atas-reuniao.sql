-- Confluir — Atas de reunião (2026-07-28)
--
-- Atas de reunião da entidade, ancoradas no MANDATO (o mandato realiza reuniões
-- de várias naturezas). Caminho principal = página do mandato; também há lista
-- geral em Institucional. O PDF (documento oficial) sobe por file uploader; os
-- campos são metadados pesquisáveis. O stub `diretoria_atas` não serve.
--
-- Permissão: reusa `diretoria_reunioes` (já existe). PDF: bucket `diretoria`
-- (já existe), subpasta `atas/`. Sem SQL de permissão, sem bucket novo.
-- APÓS este script: RE-RODAR supabase/rls-emp-todas.sql (tenant_isolation +
-- grant + trigger set_emp_from_jwt na tabela nova).

create table if not exists public.reuniao_ata (
  id uuid primary key default gen_random_uuid(),
  mandato_id uuid references public.diretoria_mandatos(id),  -- âncora principal
  tipo text not null default 'diretoria'
    check (tipo in ('diretoria', 'conselho_fiscal', 'assembleia', 'outra')),
  orgao text,                 -- rótulo livre do órgão (útil p/ "outra")
  titulo text,
  data date,
  hora text,
  local text,
  pauta text,
  deliberacoes text,
  presentes text,             -- v1: um nome por linha
  observacoes text,
  documento_url text,         -- PDF no bucket `diretoria`, path atas/<uuid>.pdf
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reuniao_ata_emp on public.reuniao_ata (emp_proprietaria_id);
create index if not exists idx_reuniao_ata_mandato on public.reuniao_ata (mandato_id);
create index if not exists idx_reuniao_ata_data on public.reuniao_ata (data);
