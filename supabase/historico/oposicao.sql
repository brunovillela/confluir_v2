-- Confluir — Oposição à Contribuição Assistencial: estrutura (2026-07-25)
--
-- Área do módulo Filiação. Espelha 4 data types do Bubble:
--   Oposição de contribuição (campanha) · Oposição_perguntas · Oposição_opositor
--   (JÁ existe no Supabase, 0 linhas) · Oposição_resposta.
-- + junção de fontes pagadoras, trilha de auditoria e perfil de não-filiado.
--
-- Todas as tabelas nascem tenant-owned (emp_proprietaria_id). Depois deste
-- script, RE-RODAR supabase/rls-emp-todas.sql (data-driven) para aplicar
-- tenant_isolation + grant + trigger nas tabelas novas. Idempotente.

-- 1. Campanha ------------------------------------------------------------------
create table if not exists public.oposicao_campanha (
  id uuid primary key default gen_random_uuid(),
  bubble_id text,
  codigo text,
  nome text,
  detalhe_desconto text,
  empresa_id uuid references public.empresa(id),
  prazo_inicio date,
  prazo_fim date,
  -- Vídeos de sensibilização por perfil (+ tempo mínimo, em segundos).
  video_filiado_url text,
  video_filiado_tempo integer,
  video_nao_filiado_url text,
  video_nao_filiado_tempo integer,
  video_agradecimento_url text,
  -- Novos (pedido do usuário): como o trabalhador formaliza.
  modo_formalizacao text not null default 'tela'
    check (modo_formalizacao in ('tela', 'assinatura', 'hibrido')),
  texto_declaracao text,
  documento_modelo_url text,
  situacao text not null default 'rascunho'
    check (situacao in ('rascunho', 'aberta', 'encerrada')),
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_oposicao_campanha_emp
  on public.oposicao_campanha (emp_proprietaria_id);
create index if not exists idx_oposicao_campanha_bubble
  on public.oposicao_campanha (bubble_id);

-- 2. Fontes pagadoras da campanha (espelha voto_campanha_fontes) --------------
create table if not exists public.oposicao_campanha_fontes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid references public.oposicao_campanha(id) on delete cascade,
  empresa_id uuid references public.empresa(id),
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  unique (campanha_id, empresa_id)
);
create index if not exists idx_oposicao_campanha_fontes_campanha
  on public.oposicao_campanha_fontes (campanha_id);

-- 3. Perguntas da campanha -----------------------------------------------------
create table if not exists public.oposicao_perguntas (
  id uuid primary key default gen_random_uuid(),
  bubble_id text,
  campanha_id uuid references public.oposicao_campanha(id) on delete cascade,
  pergunta text,
  ordem integer not null default 0,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_oposicao_perguntas_campanha
  on public.oposicao_perguntas (campanha_id);

-- 4. Opositor (JÁ EXISTE) — colunas novas -------------------------------------
alter table public.oposicao_opositor
  add column if not exists emp_proprietaria_id uuid references public.empresa(id),
  add column if not exists campanha_id uuid references public.oposicao_campanha(id),
  add column if not exists situacao text
    check (situacao in ('aguardando_documento','nao_avaliada','aprovada','reprovada','desistente')),
  add column if not exists protocolo integer,
  add column if not exists documento_assinado_url text,
  add column if not exists reprovacao_motivo text,
  add column if not exists ip text,
  add column if not exists user_agent text,
  add column if not exists confirmado_em timestamptz;
create index if not exists idx_oposicao_opositor_campanha
  on public.oposicao_opositor (campanha_id);
create index if not exists idx_oposicao_opositor_emp
  on public.oposicao_opositor (emp_proprietaria_id);
create index if not exists idx_oposicao_opositor_cpf
  on public.oposicao_opositor (cpf);

-- 5. Respostas do questionário -------------------------------------------------
create table if not exists public.oposicao_resposta (
  id uuid primary key default gen_random_uuid(),
  bubble_id text,
  opositor_id uuid references public.oposicao_opositor(id) on delete cascade,
  pergunta_id uuid references public.oposicao_perguntas(id),
  resposta text,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_oposicao_resposta_opositor
  on public.oposicao_resposta (opositor_id);

-- 6. Trilha de auditoria (append-only) — só p/ oposições novas -----------------
create table if not exists public.oposicao_eventos (
  id uuid primary key default gen_random_uuid(),
  opositor_id uuid references public.oposicao_opositor(id) on delete cascade,
  evento text,
  detalhe text,
  ip text,
  user_agent text,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_oposicao_eventos_opositor
  on public.oposicao_eventos (opositor_id);

-- 7. Perfil de não-filiado (autocadastro no portal) ---------------------------
create table if not exists public.portal_nao_filiado (
  id uuid primary key default gen_random_uuid(),
  cpf text,
  nome text,
  email text,
  telefone text,
  nascimento date,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  unique (emp_proprietaria_id, cpf)
);

-- 8. Permissão dedicada (área de Filiação) ------------------------------------
alter table public.permissoes
  add column if not exists filiacao_oposicao boolean not null default false;
update public.permissoes set filiacao_oposicao = true where usuario_id is not null;

-- APÓS este script: re-rodar supabase/rls-emp-todas.sql (aplica RLS/grant/
-- trigger a estas 7 tabelas, todas com emp_proprietaria_id).
