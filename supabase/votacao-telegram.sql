-- Confluir — Link único de votação: confirmação pelo Telegram (2026-10-07)
--
-- Alternativa ao código por e-mail no /votar: a página gera um token, a
-- pessoa toca em "Abrir o Telegram" (t.me/<bot>?start=lu_<token>), aperta
-- Iniciar e compartilha o próprio número (o Telegram já confirmou esse
-- número por SMS). A página percebe a confirmação e segue para os mesmos
-- dados de identificação. Depois do vínculo, o apto guarda o chat
-- (voto_assembleias_aptos.telegram_chat_id, que já existia) e o comprovante
-- vai pelo Telegram.
--
-- Só o servidor (service role) lê e grava: RLS ligada, sem política.
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.votacao_telegram_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  token text not null unique,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  chat_id text,
  telefone text,
  nome_telegram text,
  confirmado_em timestamptz,
  usado_em timestamptz,
  -- tentativas de cadastro que não conferiram (trava em 5 por chat)
  falhas_cadastro integer not null default 0
);

alter table public.votacao_telegram_confirmacoes
  add column if not exists falhas_cadastro integer not null default 0;

create index if not exists votacao_telegram_confirmacoes_chat_idx
  on public.votacao_telegram_confirmacoes (chat_id)
  where chat_id is not null and confirmado_em is null;

alter table public.votacao_telegram_confirmacoes enable row level security;

comment on table public.votacao_telegram_confirmacoes is
  'Confirmação de identidade pelo bot do Telegram no link único de votação (/votar). Token de uso único, 15 min.';
