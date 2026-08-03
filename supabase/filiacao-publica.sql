-- Confluir — Ficha de filiação pública (sem login) (2026-07-31)
--
-- Área do módulo Filiação. Formulário público onde o aspirante se cadastra
-- sozinho, confirma o e-mail por código, assina a ficha (Assinador gov.br,
-- upload de PDF) e envia; a submissão entra na fila de avaliação e, aprovada,
-- CRIA a filiação de verdade em `filiacoes`.
--
-- Espelha o padrão da Oposição (oposicao_opositor + oposicao_eventos): rota
-- pública grava via service role + tenantAtual(); protocolo sequencial; trilha
-- append-only; upload de PDF assinado no Storage.
--
-- Todas as tabelas nascem tenant-owned (emp_proprietaria_id). Depois deste
-- script, RE-RODAR supabase/rls-emp-todas.sql (data-driven) para aplicar
-- tenant_isolation + grant + trigger nas tabelas novas. Idempotente.
--
-- Requer o wrapper IMMUTABLE public.f_unaccent (supabase/busca-filiados.sql) p/
-- a coluna gerada nome_completo_norm (busca sem acento no avaliador).

-- 1. Solicitação (a submissão pública) ----------------------------------------
create table if not exists public.filiacao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  -- token do link único enviado no e-mail de boas-vindas (/ficha/<token>)
  token uuid not null default gen_random_uuid(),
  -- dados pessoais
  nome_completo text,
  nome_completo_norm text
    generated always as (public.f_unaccent(lower(nome_completo))) stored,
  nome_social text,
  cpf text,
  nascimento_data date,
  sexo text,
  -- contato
  email text,
  telefone_1 text,
  telefone_1_whatsapp boolean not null default false,
  telefone_2 text,
  -- endereço
  endereco_cep text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_estado text,
  -- vínculo (fonte pagadora)
  empregador_id uuid references public.empresa(id),
  matricula text,
  cargo text,
  lotacao text,
  -- aceites (data + qual versão do termo vigente foi aceita)
  aceite_lgpd_data timestamptz,
  aceite_desconto_data timestamptz,
  tl_lgpd_id uuid references public.filiacao_tl_lgpd(id),
  tl_desconto_id uuid references public.filiacao_tl_desconto(id),
  -- verificação por código de e-mail (código guardado hasheado)
  codigo_hash text,
  codigo_expira_em timestamptz,
  codigo_tentativas integer not null default 0,
  email_verificado_em timestamptz,
  -- fluxo
  situacao text not null default 'aguardando_verificacao'
    check (situacao in (
      'aguardando_verificacao', 'aguardando_assinatura',
      'nao_avaliada', 'aprovada', 'reprovada', 'desistente'
    )),
  documento_assinado_url text,
  protocolo integer,
  -- avaliação (cria filiacoes na aprovação)
  filiacao_id uuid references public.filiacoes(id),
  avaliacao boolean,
  avaliacao_data date,
  avaliacao_avaliador_id uuid references public.usuarios(id),
  reprovacao_motivo text,
  -- meta
  ip text,
  user_agent text,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
-- Idempotente p/ bancos onde a tabela já existia sem as colunas.
alter table public.filiacao_solicitacoes
  add column if not exists nome_social text,
  add column if not exists tl_lgpd_id uuid references public.filiacao_tl_lgpd(id),
  add column if not exists tl_desconto_id uuid references public.filiacao_tl_desconto(id);

create unique index if not exists idx_filiacao_solicitacoes_token
  on public.filiacao_solicitacoes (token);
create index if not exists idx_filiacao_solicitacoes_emp
  on public.filiacao_solicitacoes (emp_proprietaria_id);
create index if not exists idx_filiacao_solicitacoes_cpf
  on public.filiacao_solicitacoes (cpf);
create index if not exists idx_filiacao_solicitacoes_situacao
  on public.filiacao_solicitacoes (situacao);
create index if not exists idx_filiacao_solicitacoes_nome_norm_trgm
  on public.filiacao_solicitacoes using gin (nome_completo_norm gin_trgm_ops);

-- 2. Trilha de auditoria (append-only) ----------------------------------------
create table if not exists public.filiacao_solicitacao_eventos (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid
    references public.filiacao_solicitacoes(id) on delete cascade,
  evento text,
  detalhe text,
  ip text,
  user_agent text,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_filiacao_solicitacao_eventos_solicitacao
  on public.filiacao_solicitacao_eventos (solicitacao_id);

-- 3. Bucket privado do PDF assinado -------------------------------------------
insert into storage.buckets (id, name, public)
  values ('filiacao', 'filiacao', false)
  on conflict (id) do nothing;

-- APÓS este script: re-rodar supabase/rls-emp-todas.sql (aplica RLS/grant/
-- trigger às 2 tabelas novas, ambas com emp_proprietaria_id). O acesso a dados
-- é sempre via service role (createAdminClient) — a rota pública é anon.
